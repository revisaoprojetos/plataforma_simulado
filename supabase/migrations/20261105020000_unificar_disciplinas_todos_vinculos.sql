-- Unificar disciplinas SEM perder vínculos.
-- Problema: a unificação só repontava questões, assuntos e cronograma (links/metas). Todo o resto que aponta p/ a disciplina
-- (pasta-disciplina da Biblioteca = simulado_pastas.disciplina_id, conjuntos do cronograma, etc.) ficava apontando p/ a
-- DUPLICADA; ao apagá-la, o FK `ON DELETE SET NULL` zerava o vínculo ("desvincula tudo").
-- Agora: (1) repontam TODAS as tabelas com coluna `disciplina_id` (descoberta dinâmica), (2) a canônica HERDA classificação/cor/ordem
-- das duplicadas quando não tem, (3) o log de reversão guarda a linha da disciplina + os ids de cada vínculo → desfazer restaura tudo.
-- Idempotente (CREATE OR REPLACE). Aplicação manual no SQL Editor.

-- ── Chave do nome (sem acento/caixa/espaço invisível) — usada p/ aliases e p/ a trava única (20261105030000) ──
CREATE OR REPLACE FUNCTION public.simulado_norm_nome(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  SELECT btrim(regexp_replace(
           lower(regexp_replace(normalize(coalesce(p, ''), NFD), '[\u0300-\u036f\u200b-\u200d\ufeff]', '', 'g')),
           '[\s\u00a0\u2000-\u200a\u202f\u205f\u3000]+', ' ', 'g'))
$$;

-- ── ALIASES: nomes que JÁ foram unificados numa disciplina. O importador consulta esta tabela antes de criar → um nome que o admin
--    já decidiu ser "a mesma coisa" (ex.: "Processo Civil" → "Direito Processual Civil") nunca recria a duplicada.
CREATE TABLE IF NOT EXISTS public.simulado_disciplina_aliases (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  alias_norm    text NOT NULL,
  disciplina_id uuid NOT NULL REFERENCES public.simulado_disciplinas(id) ON DELETE CASCADE,
  alias_texto   text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, alias_norm)
);
CREATE INDEX IF NOT EXISTS idx_disc_alias_disc ON public.simulado_disciplina_aliases (disciplina_id);
ALTER TABLE public.simulado_disciplina_aliases ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.simulado_unificar_disciplinas(
  p_tenant   uuid,
  p_canonica uuid,
  p_dups     uuid[],
  p_ator     uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_esperado int; v_valid int; v_nome text;
  v_q int; v_a int; v_outros int := 0;
  v_mapa jsonb := '[]'::jsonb;
  v_d record; v_t record; v_r record;
  v_ids jsonb; v_refs jsonb; v_n int; v_tem_id boolean;
BEGIN
  IF p_dups IS NULL OR array_length(p_dups, 1) IS NULL THEN RAISE EXCEPTION 'nenhuma disciplina duplicada informada'; END IF;
  IF p_canonica = ANY(p_dups) THEN RAISE EXCEPTION 'a disciplina a manter nao pode estar entre as duplicadas'; END IF;
  v_esperado := array_length(array_append(p_dups, p_canonica), 1);
  SELECT count(*) INTO v_valid FROM public.simulado_disciplinas WHERE tenant_id = p_tenant AND id = ANY(array_append(p_dups, p_canonica));
  IF v_valid <> v_esperado THEN RAISE EXCEPTION 'disciplina invalida ou fora do tenant'; END IF;
  SELECT nome INTO v_nome FROM public.simulado_disciplinas WHERE id = p_canonica AND tenant_id = p_tenant;

  SELECT count(*) INTO v_q FROM public.simulado_questoes WHERE tenant_id = p_tenant AND deletado = false AND disciplina_id = ANY(p_dups);
  SELECT count(*) INTO v_a FROM public.simulado_assuntos WHERE tenant_id = p_tenant AND disciplina_id = ANY(p_dups);

  -- Por duplicada: snapshot da linha + ids dos vínculos de CADA tabela (p/ desfazer) e repontamento.
  FOR v_d IN SELECT * FROM public.simulado_disciplinas WHERE tenant_id = p_tenant AND id = ANY(p_dups) LOOP
    v_refs := '[]'::jsonb;
    FOR v_t IN
      SELECT c.table_name AS t
        FROM information_schema.columns c
        JOIN information_schema.tables tb ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
       WHERE c.table_schema = 'public' AND c.column_name = 'disciplina_id'
         AND c.table_name NOT IN ('simulado_disciplinas', 'simulado_disciplina_unificacoes')
         AND EXISTS (SELECT 1 FROM information_schema.columns x WHERE x.table_schema = 'public' AND x.table_name = c.table_name AND x.column_name = 'tenant_id')
    LOOP
      v_tem_id := EXISTS (SELECT 1 FROM information_schema.columns x WHERE x.table_schema = 'public' AND x.table_name = v_t.t AND x.column_name = 'id');
      v_ids := '[]'::jsonb;
      IF v_tem_id THEN
        EXECUTE format('SELECT COALESCE(jsonb_agg(id), ''[]''::jsonb) FROM public.%I WHERE tenant_id = $1 AND disciplina_id = $2', v_t.t)
          INTO v_ids USING p_tenant, v_d.id;
      END IF;
      BEGIN
        EXECUTE format('UPDATE public.%I SET disciplina_id = $1 WHERE tenant_id = $2 AND disciplina_id = $3', v_t.t) USING p_canonica, p_tenant, v_d.id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
      EXCEPTION WHEN unique_violation THEN
        -- chave única (ex.: disciplina+aula) colide com linha que a canônica já tem: repontua linha a linha, mantendo as que colidem.
        v_n := 0;
        FOR v_r IN EXECUTE format('SELECT ctid AS c FROM public.%I WHERE tenant_id = $1 AND disciplina_id = $2', v_t.t) USING p_tenant, v_d.id LOOP
          BEGIN
            EXECUTE format('UPDATE public.%I SET disciplina_id = $1 WHERE ctid = $2', v_t.t) USING p_canonica, v_r.c;
            v_n := v_n + 1;
          EXCEPTION WHEN unique_violation THEN NULL; END;
        END LOOP;
      END;
      IF v_t.t NOT IN ('simulado_questoes', 'simulado_assuntos') THEN v_outros := v_outros + COALESCE(v_n, 0); END IF;
      IF jsonb_array_length(v_ids) > 0 THEN v_refs := v_refs || jsonb_build_array(jsonb_build_object('tabela', v_t.t, 'ids', v_ids)); END IF;
    END LOOP;

    -- a canônica herda o que não tem (classificação/cor/ordem) da duplicada
    UPDATE public.simulado_disciplinas SET
      classificacao = COALESCE(classificacao, v_d.classificacao),
      cor           = COALESCE(cor, v_d.cor),
      ordem         = COALESCE(ordem, v_d.ordem)
     WHERE id = p_canonica AND tenant_id = p_tenant;

    v_mapa := v_mapa || jsonb_build_array(jsonb_build_object(
      'disciplina_id', v_d.id, 'nome', v_d.nome, 'classificacao', v_d.classificacao, 'cor', v_d.cor, 'ordem', v_d.ordem,
      'refs', v_refs,
      -- compat com o formato antigo do log (questao_ids/assunto_ids) — o desfazer novo usa `refs`, o antigo ainda funciona
      'questao_ids', COALESCE((SELECT r->'ids' FROM jsonb_array_elements(v_refs) r WHERE r->>'tabela' = 'simulado_questoes'), '[]'::jsonb),
      'assunto_ids', COALESCE((SELECT r->'ids' FROM jsonb_array_elements(v_refs) r WHERE r->>'tabela' = 'simulado_assuntos'), '[]'::jsonb)
    ));
  END LOOP;

  INSERT INTO public.simulado_disciplina_unificacoes (tenant_id, canonica_id, canonica_nome, mapa, criado_por)
    VALUES (p_tenant, p_canonica, v_nome, v_mapa, p_ator);

  -- aliases: cada nome unificado passa a apontar p/ a canônica (importações futuras com esse texto usam a canônica)
  INSERT INTO public.simulado_disciplina_aliases (tenant_id, alias_norm, disciplina_id, alias_texto)
    SELECT p_tenant, public.simulado_norm_nome(d.nome), p_canonica, d.nome
      FROM public.simulado_disciplinas d
     WHERE d.tenant_id = p_tenant AND d.id = ANY(p_dups)
       AND public.simulado_norm_nome(d.nome) <> '' AND public.simulado_norm_nome(d.nome) <> public.simulado_norm_nome(v_nome)
    ON CONFLICT (tenant_id, alias_norm) DO UPDATE SET disciplina_id = EXCLUDED.disciplina_id, alias_texto = EXCLUDED.alias_texto;

  DELETE FROM public.simulado_disciplinas WHERE tenant_id = p_tenant AND id = ANY(p_dups);

  RETURN jsonb_build_object('ok', true, 'questoes', v_q, 'assuntos', v_a, 'outros', v_outros,
                            'removidas', array_length(p_dups, 1), 'mantida', v_nome);
END;
$$;

CREATE OR REPLACE FUNCTION public.simulado_desfazer_unificacao(
  p_tenant     uuid,
  p_unificacao uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row public.simulado_disciplina_unificacoes;
  v_item jsonb; v_ref jsonb; v_new uuid; v_ids uuid[];
  v_total int := 0;
BEGIN
  SELECT * INTO v_row FROM public.simulado_disciplina_unificacoes WHERE id = p_unificacao AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'unificacao nao encontrada'; END IF;
  IF v_row.desfeita THEN RAISE EXCEPTION 'unificacao ja desfeita'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_row.mapa) LOOP
    v_new := NULL;
    SELECT id INTO v_new FROM public.simulado_disciplinas WHERE tenant_id = p_tenant AND nome = (v_item->>'nome') LIMIT 1;
    -- o nome volta a existir por si: o alias dele deixa de valer
    DELETE FROM public.simulado_disciplina_aliases WHERE tenant_id = p_tenant AND alias_norm = public.simulado_norm_nome(v_item->>'nome');
    IF v_new IS NULL THEN
      INSERT INTO public.simulado_disciplinas (tenant_id, nome, classificacao, cor, ordem)
        VALUES (p_tenant, v_item->>'nome', NULLIF(v_item->>'classificacao', ''), NULLIF(v_item->>'cor', ''), NULLIF(v_item->>'ordem', '')::int)
        RETURNING id INTO v_new;
    END IF;

    IF jsonb_typeof(v_item->'refs') = 'array' THEN
      -- formato novo: restaura TODAS as tabelas (pastas, conjuntos, links, metas, questões, assuntos…)
      FOR v_ref IN SELECT * FROM jsonb_array_elements(v_item->'refs') LOOP
        SELECT COALESCE(array_agg((e)::uuid), '{}') INTO v_ids FROM jsonb_array_elements_text(v_ref->'ids') e;
        IF array_length(v_ids, 1) IS NOT NULL THEN
          BEGIN
            EXECUTE format('UPDATE public.%I SET disciplina_id = $1 WHERE tenant_id = $2 AND id = ANY($3)', v_ref->>'tabela') USING v_new, p_tenant, v_ids;
          EXCEPTION WHEN undefined_table OR undefined_column OR unique_violation THEN NULL; END;
          IF v_ref->>'tabela' = 'simulado_questoes' THEN v_total := v_total + array_length(v_ids, 1); END IF;
        END IF;
      END LOOP;
    ELSE
      -- log antigo (só questões/assuntos)
      SELECT COALESCE(array_agg((e)::uuid), '{}') INTO v_ids FROM jsonb_array_elements_text(v_item->'questao_ids') e;
      IF array_length(v_ids, 1) IS NOT NULL THEN
        UPDATE public.simulado_questoes SET disciplina_id = v_new WHERE tenant_id = p_tenant AND id = ANY(v_ids);
        v_total := v_total + array_length(v_ids, 1);
      END IF;
      SELECT COALESCE(array_agg((e)::uuid), '{}') INTO v_ids FROM jsonb_array_elements_text(v_item->'assunto_ids') e;
      IF array_length(v_ids, 1) IS NOT NULL THEN
        UPDATE public.simulado_assuntos SET disciplina_id = v_new WHERE tenant_id = p_tenant AND id = ANY(v_ids);
      END IF;
    END IF;
  END LOOP;

  UPDATE public.simulado_disciplina_unificacoes SET desfeita = true WHERE id = p_unificacao;
  RETURN jsonb_build_object('ok', true, 'questoes', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.simulado_unificar_disciplinas(uuid, uuid, uuid[], uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.simulado_desfazer_unificacao(uuid, uuid) TO service_role, authenticated;
NOTIFY pgrst, 'reload schema';
