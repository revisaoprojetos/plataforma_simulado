-- Unificação de disciplinas duplicadas — ATÔMICA e REVERSÍVEL.
-- A aba /admin/questoes?tab=disciplinas mescla disciplinas com nomes diferentes
-- que são a mesma coisa. Fazer isso em várias chamadas PostgREST separadas não é
-- transacional: uma falha no meio deixa estado parcial. Aqui tudo roda dentro de
-- UMA função (= 1 transação): ou aplica tudo, ou faz rollback. E gravamos um LOG
-- com o mapa (questões afetadas por disciplina) para permitir DESFAZER sem perder
-- dados (as questões nunca são apagadas — só têm o disciplina_id repontado).

-- ── Log de reversão ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.simulado_disciplina_unificacoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.simulado_tenants(id) ON DELETE CASCADE,
  canonica_id   uuid,                         -- disciplina mantida (pode ter sido apagada depois)
  canonica_nome text,
  mapa          jsonb NOT NULL DEFAULT '[]',  -- [{disciplina_id, nome, questao_ids:[...]}]
  desfeita      boolean NOT NULL DEFAULT false,
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_disc_unif_tenant ON public.simulado_disciplina_unificacoes (tenant_id, criado_em DESC);

ALTER TABLE public.simulado_disciplina_unificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS disc_unif_isolation ON public.simulado_disciplina_unificacoes;
CREATE POLICY disc_unif_isolation ON public.simulado_disciplina_unificacoes
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

-- ── Merge atômico ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_unificar_disciplinas(
  p_tenant   uuid,
  p_canonica uuid,
  p_dups     uuid[],
  p_ator     uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_esperado int;
  v_valid    int;
  v_nome     text;
  v_q        int;
  v_a        int;
  v_mapa     jsonb;
BEGIN
  IF p_dups IS NULL OR array_length(p_dups, 1) IS NULL THEN
    RAISE EXCEPTION 'nenhuma disciplina duplicada informada';
  END IF;
  IF p_canonica = ANY(p_dups) THEN
    RAISE EXCEPTION 'a disciplina a manter nao pode estar entre as duplicadas';
  END IF;

  -- Todas (canônica + duplicadas) devem existir no tenant (evita merge cross-tenant).
  v_esperado := array_length(array_append(p_dups, p_canonica), 1);
  SELECT count(*) INTO v_valid FROM public.simulado_disciplinas
    WHERE tenant_id = p_tenant AND id = ANY(array_append(p_dups, p_canonica));
  IF v_valid <> v_esperado THEN
    RAISE EXCEPTION 'disciplina invalida ou fora do tenant';
  END IF;

  SELECT nome INTO v_nome FROM public.simulado_disciplinas WHERE id = p_canonica AND tenant_id = p_tenant;

  -- Mapa para reversão: por disciplina duplicada, TODOS os ids de questão movidos
  -- (inclusive deletadas — para não orfanar o FK e permitir undo completo).
  SELECT jsonb_agg(jsonb_build_object(
           'disciplina_id', d.id,
           'nome',          d.nome,
           'questao_ids',   COALESCE((SELECT jsonb_agg(q.id) FROM public.simulado_questoes q
                                       WHERE q.tenant_id = p_tenant AND q.disciplina_id = d.id), '[]'::jsonb)
         ))
    INTO v_mapa
    FROM public.simulado_disciplinas d
    WHERE d.tenant_id = p_tenant AND d.id = ANY(p_dups);

  -- Contagens de impacto (para exibição).
  SELECT count(*) INTO v_q FROM public.simulado_questoes
    WHERE tenant_id = p_tenant AND deletado = false AND disciplina_id = ANY(p_dups);
  SELECT count(*) INTO v_a FROM public.simulado_assuntos
    WHERE tenant_id = p_tenant AND disciplina_id = ANY(p_dups);

  -- Repoint (antes de apagar): questões (todas), assuntos, cronograma.
  UPDATE public.simulado_questoes SET disciplina_id = p_canonica
    WHERE tenant_id = p_tenant AND disciplina_id = ANY(p_dups);
  UPDATE public.simulado_assuntos SET disciplina_id = p_canonica
    WHERE tenant_id = p_tenant AND disciplina_id = ANY(p_dups);
  BEGIN
    UPDATE public.simulado_cronograma_links SET disciplina_id = p_canonica
      WHERE tenant_id = p_tenant AND disciplina_id = ANY(p_dups);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;
  BEGIN
    UPDATE public.simulado_cronograma_metas SET disciplina_id = p_canonica
      WHERE tenant_id = p_tenant AND disciplina_id = ANY(p_dups);
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL; END;

  -- Log ANTES de apagar (fonte do undo).
  INSERT INTO public.simulado_disciplina_unificacoes (tenant_id, canonica_id, canonica_nome, mapa, criado_por)
    VALUES (p_tenant, p_canonica, v_nome, COALESCE(v_mapa, '[]'::jsonb), p_ator);

  -- Apaga as duplicadas (já sem referências).
  DELETE FROM public.simulado_disciplinas WHERE tenant_id = p_tenant AND id = ANY(p_dups);

  RETURN jsonb_build_object('ok', true, 'questoes', v_q, 'assuntos', v_a,
                            'removidas', array_length(p_dups, 1), 'mantida', v_nome);
END;
$$;

-- ── Desfazer (undo) ──────────────────────────────────────────────────────────
-- Recria as disciplinas apagadas pelo NOME original e repointa as questões
-- logadas de volta. As questões nunca foram perdidas, então o desfazer é seguro.
CREATE OR REPLACE FUNCTION public.simulado_desfazer_unificacao(
  p_tenant     uuid,
  p_unificacao uuid
) RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_row   public.simulado_disciplina_unificacoes;
  v_item  jsonb;
  v_new   uuid;
  v_qids  uuid[];
  v_total int := 0;
BEGIN
  SELECT * INTO v_row FROM public.simulado_disciplina_unificacoes
    WHERE id = p_unificacao AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'unificacao nao encontrada'; END IF;
  IF v_row.desfeita THEN RAISE EXCEPTION 'unificacao ja desfeita'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_row.mapa) LOOP
    -- Recria a disciplina pelo nome (novo id). Se já existir esse nome, reusa.
    INSERT INTO public.simulado_disciplinas (tenant_id, nome)
      VALUES (p_tenant, v_item->>'nome')
      ON CONFLICT (tenant_id, nome) DO UPDATE SET nome = EXCLUDED.nome
      RETURNING id INTO v_new;

    SELECT COALESCE(array_agg((e)::uuid), '{}') INTO v_qids
      FROM jsonb_array_elements_text(v_item->'questao_ids') e;

    IF array_length(v_qids, 1) IS NOT NULL THEN
      UPDATE public.simulado_questoes SET disciplina_id = v_new
        WHERE tenant_id = p_tenant AND id = ANY(v_qids);
      v_total := v_total + array_length(v_qids, 1);
    END IF;
  END LOOP;

  UPDATE public.simulado_disciplina_unificacoes SET desfeita = true WHERE id = p_unificacao;
  RETURN jsonb_build_object('ok', true, 'questoes', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.simulado_unificar_disciplinas(uuid, uuid, uuid[], uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.simulado_desfazer_unificacao(uuid, uuid) TO service_role, authenticated;

NOTIFY pgrst, 'reload schema';
