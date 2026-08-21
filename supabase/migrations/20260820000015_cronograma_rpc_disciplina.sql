-- A RPC de substituição de metas passa a gravar `disciplina_id`, resolvido pelo
-- importador contra o cadastro `simulado_disciplinas`. Sem isto, a coluna ficaria
-- sempre nula na importação e o casamento com os links continuaria por grafia.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_substituir_metas(
  p_tenant uuid, p_cronograma uuid, p_metas jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_antes  integer;
  v_depois integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.simulado_cronogramas
    WHERE id = p_cronograma AND tenant_id = p_tenant AND deletado = false
  ) THEN
    RAISE EXCEPTION 'Cronograma % nao encontrado no tenant %', p_cronograma, p_tenant;
  END IF;

  SELECT count(*) INTO v_antes
    FROM public.simulado_cronograma_metas
    WHERE tenant_id = p_tenant AND cronograma_id = p_cronograma;

  DELETE FROM public.simulado_cronograma_metas
    WHERE tenant_id = p_tenant AND cronograma_id = p_cronograma;

  INSERT INTO public.simulado_cronograma_metas
    (tenant_id, cronograma_id, semana, dia, tipo, disciplina, disciplina_id, aula, conteudo, duracao, ordem,
     simulado_id, simulado_externo_nome, simulado_externo_url)
  SELECT
    p_tenant, p_cronograma,
    (m->>'semana')::integer,
    (m->>'dia')::smallint,
    m->>'tipo',
    m->>'disciplina',
    NULLIF(m->>'disciplina_id', '')::uuid,
    NULLIF(m->>'aula', ''),        -- ->> devolve TEXTO: "01" continua "01", nao vira 1
    NULLIF(m->>'conteudo', ''),
    NULLIF(m->>'duracao', ''),
    COALESCE((m->>'ordem')::integer, 0),
    NULLIF(m->>'simulado_id', '')::uuid,
    NULLIF(m->>'simulado_externo_nome', ''),
    NULLIF(m->>'simulado_externo_url', '')
  FROM jsonb_array_elements(p_metas) AS m;

  GET DIAGNOSTICS v_depois = ROW_COUNT;

  UPDATE public.simulado_cronogramas
    SET atualizado_em = now()
    WHERE id = p_cronograma AND tenant_id = p_tenant;

  RETURN jsonb_build_object('antes', v_antes, 'depois', v_depois);
END $$;

NOTIFY pgrst, 'reload schema';
