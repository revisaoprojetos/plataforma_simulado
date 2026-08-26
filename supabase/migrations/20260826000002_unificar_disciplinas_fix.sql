-- Correção das funções de unificação de disciplinas (a 20260826000001 já rodou).
-- 1) simulado_desfazer_unificacao: trocado ON CONFLICT (tenant_id, nome) por
--    SELECT-then-INSERT — bases migradas (twdr) NÃO têm o UNIQUE(tenant_id, nome),
--    então o ON CONFLICT estourava 42P10. Agora funciona com ou sem o constraint.
-- 2) simulado_unificar_disciplinas: passa a gravar também os `assunto_ids` no mapa,
--    e o desfazer restaura os assuntos além das questões (undo 100%).

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

  v_esperado := array_length(array_append(p_dups, p_canonica), 1);
  SELECT count(*) INTO v_valid FROM public.simulado_disciplinas
    WHERE tenant_id = p_tenant AND id = ANY(array_append(p_dups, p_canonica));
  IF v_valid <> v_esperado THEN
    RAISE EXCEPTION 'disciplina invalida ou fora do tenant';
  END IF;

  SELECT nome INTO v_nome FROM public.simulado_disciplinas WHERE id = p_canonica AND tenant_id = p_tenant;

  SELECT jsonb_agg(jsonb_build_object(
           'disciplina_id', d.id,
           'nome',          d.nome,
           'questao_ids',   COALESCE((SELECT jsonb_agg(q.id) FROM public.simulado_questoes q
                                       WHERE q.tenant_id = p_tenant AND q.disciplina_id = d.id), '[]'::jsonb),
           'assunto_ids',   COALESCE((SELECT jsonb_agg(a.id) FROM public.simulado_assuntos a
                                       WHERE a.tenant_id = p_tenant AND a.disciplina_id = d.id), '[]'::jsonb)
         ))
    INTO v_mapa
    FROM public.simulado_disciplinas d
    WHERE d.tenant_id = p_tenant AND d.id = ANY(p_dups);

  SELECT count(*) INTO v_q FROM public.simulado_questoes
    WHERE tenant_id = p_tenant AND deletado = false AND disciplina_id = ANY(p_dups);
  SELECT count(*) INTO v_a FROM public.simulado_assuntos
    WHERE tenant_id = p_tenant AND disciplina_id = ANY(p_dups);

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

  INSERT INTO public.simulado_disciplina_unificacoes (tenant_id, canonica_id, canonica_nome, mapa, criado_por)
    VALUES (p_tenant, p_canonica, v_nome, COALESCE(v_mapa, '[]'::jsonb), p_ator);

  DELETE FROM public.simulado_disciplinas WHERE tenant_id = p_tenant AND id = ANY(p_dups);

  RETURN jsonb_build_object('ok', true, 'questoes', v_q, 'assuntos', v_a,
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
  v_row   public.simulado_disciplina_unificacoes;
  v_item  jsonb;
  v_new   uuid;
  v_qids  uuid[];
  v_aids  uuid[];
  v_total int := 0;
BEGIN
  SELECT * INTO v_row FROM public.simulado_disciplina_unificacoes
    WHERE id = p_unificacao AND tenant_id = p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'unificacao nao encontrada'; END IF;
  IF v_row.desfeita THEN RAISE EXCEPTION 'unificacao ja desfeita'; END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_row.mapa) LOOP
    v_new := NULL;
    SELECT id INTO v_new FROM public.simulado_disciplinas
      WHERE tenant_id = p_tenant AND nome = (v_item->>'nome') LIMIT 1;
    IF v_new IS NULL THEN
      INSERT INTO public.simulado_disciplinas (tenant_id, nome)
        VALUES (p_tenant, v_item->>'nome') RETURNING id INTO v_new;
    END IF;

    SELECT COALESCE(array_agg((e)::uuid), '{}') INTO v_qids
      FROM jsonb_array_elements_text(v_item->'questao_ids') e;
    IF array_length(v_qids, 1) IS NOT NULL THEN
      UPDATE public.simulado_questoes SET disciplina_id = v_new
        WHERE tenant_id = p_tenant AND id = ANY(v_qids);
      v_total := v_total + array_length(v_qids, 1);
    END IF;

    SELECT COALESCE(array_agg((e)::uuid), '{}') INTO v_aids
      FROM jsonb_array_elements_text(v_item->'assunto_ids') e;
    IF array_length(v_aids, 1) IS NOT NULL THEN
      UPDATE public.simulado_assuntos SET disciplina_id = v_new
        WHERE tenant_id = p_tenant AND id = ANY(v_aids);
    END IF;
  END LOOP;

  UPDATE public.simulado_disciplina_unificacoes SET desfeita = true WHERE id = p_unificacao;
  RETURN jsonb_build_object('ok', true, 'questoes', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.simulado_unificar_disciplinas(uuid, uuid, uuid[], uuid) TO service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.simulado_desfazer_unificacao(uuid, uuid) TO service_role, authenticated;

NOTIFY pgrst, 'reload schema';
