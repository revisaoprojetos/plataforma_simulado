-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA LEGADO ("Revisão") — integridade: chave estável, calendário congelado
--
-- (3) Reimportar zerava o progresso: simulado_cronograma_substituir_metas fazia
--     DELETE + INSERT, gerando ids novos e deixando checks/notas órfãos.
--     Agora cada meta tem uma CHAVE ESTÁVEL (md5 de cronograma, semana, dia, tipo,
--     disciplina_id|disciplina normalizada, aula normalizada, nº de ocorrência) e a
--     substituição faz DIFF por chave, PRESERVANDO o id de quem continua existindo.
--     checks/notas guardam `chave_meta` para reencaixar órfãs.
-- (2) Grade mudava sob o aluno: a emissão passa a guardar `grade_snapshot` (calendário
--     congelado) + `versao_grade`; o cronograma ganha `versao_grade`, incrementada em
--     toda mutação estrutural (trigger). Divergência => "cronograma atualizado".
--
-- IDEMPOTENTE. O código do app degrada (comportamento antigo) se esta migration ainda
-- não foi aplicada. Ordem: aplicar ANTES do deploy que usa as colunas novas (opcional,
-- o app tolera a ausência).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Colunas ───────────────────────────────────────────────────────────────
ALTER TABLE public.simulado_cronogramas
  ADD COLUMN IF NOT EXISTS versao_grade integer NOT NULL DEFAULT 1;

ALTER TABLE public.simulado_cronograma_metas
  ADD COLUMN IF NOT EXISTS chave text;
CREATE INDEX IF NOT EXISTS idx_cron_metas_chave
  ON public.simulado_cronograma_metas (cronograma_id, chave);

ALTER TABLE public.simulado_cronograma_emissoes
  ADD COLUMN IF NOT EXISTS versao_grade integer,
  ADD COLUMN IF NOT EXISTS grade_snapshot jsonb;

ALTER TABLE public.simulado_cronograma_meta_checks
  ADD COLUMN IF NOT EXISTS chave_meta text;
CREATE INDEX IF NOT EXISTS idx_cron_checks_chave
  ON public.simulado_cronograma_meta_checks (emissao_id, chave_meta) WHERE chave_meta IS NOT NULL;

ALTER TABLE public.simulado_cronograma_meta_notas
  ADD COLUMN IF NOT EXISTS chave_meta text;
CREATE INDEX IF NOT EXISTS idx_cron_notas_chave
  ON public.simulado_cronograma_meta_notas (emissao_id, chave_meta) WHERE chave_meta IS NOT NULL;

-- ── 2. Normalização (espelha lib/cronograma/chave-meta.ts: normalizarChave) ──
CREATE OR REPLACE FUNCTION public.simulado_cronograma_norm(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(btrim(regexp_replace(
    translate(coalesce(t, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
      'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'),
    '\s+', ' ', 'g')))
$$;

-- ── 3. Recalcula as chaves de UM cronograma (determinístico, idempotente) ───
CREATE OR REPLACE FUNCTION public.simulado_cronograma_recalcular_chaves(p_tenant uuid, p_cronograma uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v integer;
BEGIN
  WITH k AS (
    SELECT id,
      md5(concat_ws('|',
        cronograma_id::text, semana::text, dia::text, tipo,
        coalesce(disciplina_id::text, public.simulado_cronograma_norm(disciplina)),
        public.simulado_cronograma_norm(aula),
        (row_number() OVER (
          PARTITION BY semana, dia, tipo,
            coalesce(disciplina_id::text, public.simulado_cronograma_norm(disciplina)),
            public.simulado_cronograma_norm(aula)
          ORDER BY ordem, criado_em, id))::text
      )) AS chave
    FROM public.simulado_cronograma_metas
    WHERE tenant_id = p_tenant AND cronograma_id = p_cronograma
  ), up AS (
    UPDATE public.simulado_cronograma_metas m
       SET chave = k.chave
      FROM k
     WHERE m.id = k.id AND m.chave IS DISTINCT FROM k.chave
    RETURNING 1
  )
  SELECT count(*) INTO v FROM up;
  RETURN v;
END $$;

-- ── 4. Aplica um conjunto de metas por DIFF de chave (transacional) ─────────
--   p_semanas  : se informado, só mexe nessas semanas (repetirSemana 'substituir').
--   p_remover  : false = "acrescentar" (comporDoBanco): nunca apaga o que não veio.
-- Devolve {antes, depois, preservadas, atualizadas, inseridas, removidas, mapa:[{i,id}]}
-- onde `mapa` liga o índice de cada linha recebida ao id final da meta.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_aplicar_metas(
  p_tenant uuid, p_cronograma uuid, p_metas jsonb,
  p_semanas integer[] DEFAULT NULL, p_remover boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_antes integer; v_depois integer;
  v_pres integer := 0; v_atu integer := 0; v_ins integer := 0; v_rem integer := 0;
  v_mapa jsonb;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.simulado_cronogramas
    WHERE id = p_cronograma AND tenant_id = p_tenant AND deletado = false
  ) THEN
    RAISE EXCEPTION 'Cronograma % nao encontrado no tenant %', p_cronograma, p_tenant;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_cronograma::text, 0));
  PERFORM set_config('app.cronograma_bulk', 'on', true); -- o trigger de versao fica quieto; bump unico no fim

  SELECT count(*) INTO v_antes
    FROM public.simulado_cronograma_metas WHERE tenant_id = p_tenant AND cronograma_id = p_cronograma;

  -- Chaves vigentes das metas existentes + checks/notas reencaixados na chave ATUAL de sua meta.
  PERFORM public.simulado_cronograma_recalcular_chaves(p_tenant, p_cronograma);
  UPDATE public.simulado_cronograma_meta_checks c SET chave_meta = m.chave
    FROM public.simulado_cronograma_metas m
   WHERE m.id = c.meta_id AND m.tenant_id = p_tenant AND m.cronograma_id = p_cronograma
     AND c.tenant_id = p_tenant AND c.chave_meta IS DISTINCT FROM m.chave;
  UPDATE public.simulado_cronograma_meta_notas c SET chave_meta = m.chave
    FROM public.simulado_cronograma_metas m
   WHERE m.id = c.meta_id AND m.tenant_id = p_tenant AND m.cronograma_id = p_cronograma
     AND c.tenant_id = p_tenant AND c.chave_meta IS DISTINCT FROM m.chave;

  DROP TABLE IF EXISTS _nova_metas;
  CREATE TEMP TABLE _nova_metas ON COMMIT DROP AS
  WITH src AS (
    SELECT (t.ord - 1)::integer AS idx,
      (t.m->>'semana')::integer AS semana,
      (t.m->>'dia')::smallint AS dia,
      t.m->>'tipo' AS tipo,
      t.m->>'disciplina' AS disciplina,
      NULLIF(t.m->>'disciplina_id', '')::uuid AS disciplina_id,
      NULLIF(t.m->>'aula', '') AS aula,
      NULLIF(t.m->>'conteudo', '') AS conteudo,
      NULLIF(t.m->>'duracao', '') AS duracao,
      COALESCE((t.m->>'ordem')::integer, 0) AS ordem,
      NULLIF(t.m->>'simulado_id', '')::uuid AS simulado_id,
      NULLIF(t.m->>'simulado_externo_nome', '') AS simulado_externo_nome,
      NULLIF(t.m->>'simulado_externo_url', '') AS simulado_externo_url
    FROM jsonb_array_elements(p_metas) WITH ORDINALITY AS t(m, ord)
  )
  SELECT s.*,
    md5(concat_ws('|',
      p_cronograma::text, s.semana::text, s.dia::text, s.tipo,
      coalesce(s.disciplina_id::text, public.simulado_cronograma_norm(s.disciplina)),
      public.simulado_cronograma_norm(s.aula),
      (row_number() OVER (
        PARTITION BY s.semana, s.dia, s.tipo,
          coalesce(s.disciplina_id::text, public.simulado_cronograma_norm(s.disciplina)),
          public.simulado_cronograma_norm(s.aula)
        ORDER BY s.ordem, s.idx))::text
    )) AS chave,
    NULL::uuid AS meta_id
  FROM src s;

  IF p_semanas IS NOT NULL THEN
    DELETE FROM _nova_metas WHERE NOT (semana = ANY (p_semanas));
  END IF;

  -- 4a. Atualiza campos mutáveis de quem JÁ existe (mesma chave => mesmo id).
  WITH upd AS (
    UPDATE public.simulado_cronograma_metas e
       SET disciplina = n.disciplina, disciplina_id = n.disciplina_id, aula = n.aula,
           conteudo = n.conteudo, duracao = n.duracao, ordem = n.ordem,
           simulado_id = n.simulado_id, simulado_externo_nome = n.simulado_externo_nome,
           simulado_externo_url = n.simulado_externo_url
      FROM _nova_metas n
     WHERE p_remover  -- modo "acrescentar" (compor do banco) nunca reescreve metas existentes
       AND e.tenant_id = p_tenant AND e.cronograma_id = p_cronograma AND e.chave = n.chave
       AND (p_semanas IS NULL OR e.semana = ANY (p_semanas))
       AND (e.disciplina, e.disciplina_id, e.aula, e.conteudo, e.duracao, e.ordem,
            e.simulado_id, e.simulado_externo_nome, e.simulado_externo_url)
           IS DISTINCT FROM
           (n.disciplina, n.disciplina_id, n.aula, n.conteudo, n.duracao, n.ordem,
            n.simulado_id, n.simulado_externo_nome, n.simulado_externo_url)
    RETURNING 1
  )
  SELECT count(*) INTO v_atu FROM upd;

  UPDATE _nova_metas n SET meta_id = e.id
    FROM public.simulado_cronograma_metas e
   WHERE e.tenant_id = p_tenant AND e.cronograma_id = p_cronograma AND e.chave = n.chave
     AND (p_semanas IS NULL OR e.semana = ANY (p_semanas));
  SELECT count(*) INTO v_pres FROM _nova_metas WHERE meta_id IS NOT NULL;

  -- 4b. Remove só quem realmente SAIU (checks/notas ficam e se reencaixam por chave_meta).
  IF p_remover THEN
    WITH del AS (
      DELETE FROM public.simulado_cronograma_metas e
       WHERE e.tenant_id = p_tenant AND e.cronograma_id = p_cronograma
         AND (p_semanas IS NULL OR e.semana = ANY (p_semanas))
         AND NOT EXISTS (SELECT 1 FROM _nova_metas n WHERE n.chave = e.chave)
      RETURNING 1
    )
    SELECT count(*) INTO v_rem FROM del;
  END IF;

  -- 4c. Insere o que é novo.
  SELECT count(*) INTO v_ins FROM _nova_metas WHERE meta_id IS NULL;
  WITH ins AS (
    INSERT INTO public.simulado_cronograma_metas
      (tenant_id, cronograma_id, semana, dia, tipo, disciplina, disciplina_id, aula, conteudo, duracao, ordem,
       simulado_id, simulado_externo_nome, simulado_externo_url, chave)
    SELECT p_tenant, p_cronograma, n.semana, n.dia, n.tipo, n.disciplina, n.disciplina_id, n.aula, n.conteudo,
           n.duracao, n.ordem, n.simulado_id, n.simulado_externo_nome, n.simulado_externo_url, n.chave
      FROM _nova_metas n WHERE n.meta_id IS NULL ORDER BY n.idx
    RETURNING id, chave
  )
  UPDATE _nova_metas n SET meta_id = ins.id FROM ins WHERE n.chave = ins.chave AND n.meta_id IS NULL;

  SELECT coalesce(jsonb_agg(jsonb_build_object('i', idx, 'id', meta_id) ORDER BY idx), '[]'::jsonb)
    INTO v_mapa FROM _nova_metas;

  SELECT count(*) INTO v_depois
    FROM public.simulado_cronograma_metas WHERE tenant_id = p_tenant AND cronograma_id = p_cronograma;

  -- Estrutura mudou (entrou/saiu meta) => nova versao da grade; so texto/ordem nao conta.
  IF v_ins > 0 OR v_rem > 0 THEN
    UPDATE public.simulado_cronogramas
       SET versao_grade = versao_grade + 1, atualizado_em = now()
     WHERE id = p_cronograma AND tenant_id = p_tenant;
  ELSE
    UPDATE public.simulado_cronogramas SET atualizado_em = now()
     WHERE id = p_cronograma AND tenant_id = p_tenant;
  END IF;

  PERFORM set_config('app.cronograma_bulk', 'off', true);
  RETURN jsonb_build_object('antes', v_antes, 'depois', v_depois, 'preservadas', v_pres,
    'atualizadas', v_atu, 'inseridas', v_ins, 'removidas', v_rem, 'mapa', v_mapa);
END $$;

-- Compat: mesmo nome/assinatura de antes (importador). Agora preserva ids.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_substituir_metas(
  p_tenant uuid, p_cronograma uuid, p_metas jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN public.simulado_cronograma_aplicar_metas(p_tenant, p_cronograma, p_metas, NULL, true);
END $$;

-- ── 5. versao_grade por trigger ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_bump_versao_meta()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF coalesce(current_setting('app.cronograma_bulk', true), '') = 'on' THEN RETURN NULL; END IF;
  UPDATE public.simulado_cronogramas SET versao_grade = versao_grade + 1
   WHERE id = coalesce(NEW.cronograma_id, OLD.cronograma_id);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_cron_metas_versao ON public.simulado_cronograma_metas;
CREATE TRIGGER trg_cron_metas_versao
  AFTER INSERT OR DELETE OR UPDATE OF semana, dia, tipo ON public.simulado_cronograma_metas
  FOR EACH ROW EXECUTE FUNCTION public.simulado_cronograma_bump_versao_meta();

CREATE OR REPLACE FUNCTION public.simulado_cronograma_bump_versao_cron()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.dias_curso IS DISTINCT FROM OLD.dias_curso
     OR NEW.semanas_revisao IS DISTINCT FROM OLD.semanas_revisao
     OR NEW.total_semanas IS DISTINCT FROM OLD.total_semanas THEN
    NEW.versao_grade := coalesce(OLD.versao_grade, 1) + 1;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cron_versao ON public.simulado_cronogramas;
CREATE TRIGGER trg_cron_versao BEFORE UPDATE ON public.simulado_cronogramas
  FOR EACH ROW EXECUTE FUNCTION public.simulado_cronograma_bump_versao_cron();

-- ── 6. Backfill idempotente das chaves ───────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT tenant_id, cronograma_id FROM public.simulado_cronograma_metas WHERE chave IS NULL LOOP
    PERFORM public.simulado_cronograma_recalcular_chaves(r.tenant_id, r.cronograma_id);
  END LOOP;
END $$;

UPDATE public.simulado_cronograma_meta_checks c SET chave_meta = m.chave
  FROM public.simulado_cronograma_metas m
 WHERE m.id = c.meta_id AND c.chave_meta IS NULL AND m.chave IS NOT NULL;
UPDATE public.simulado_cronograma_meta_notas c SET chave_meta = m.chave
  FROM public.simulado_cronograma_metas m
 WHERE m.id = c.meta_id AND c.chave_meta IS NULL AND m.chave IS NOT NULL;

-- ── 7. Permissões: só service role ───────────────────────────────────────────
DO $$
DECLARE f text; r text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'simulado_cronograma_aplicar_metas(uuid, uuid, jsonb, integer[], boolean)',
    'simulado_cronograma_substituir_metas(uuid, uuid, jsonb)',
    'simulado_cronograma_recalcular_chaves(uuid, uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public;', f);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM %I;', f, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
