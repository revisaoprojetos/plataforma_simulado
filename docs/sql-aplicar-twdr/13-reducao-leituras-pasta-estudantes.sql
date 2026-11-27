-- Redução de leituras repetidas (medição 60 s em produção):
--  (A) simulado_respostas_objetivas por questao_id (269 chamadas/min, ~23 ms) → RPCs agregadas p/ o
--      fallback PostgREST dos relatórios de estudante/disciplina (antes: N páginas de 1000 linhas).
--      O índice (questao_id, id) INCLUDE (sessao_id, correta) JÁ existe (ix_resp_obj_questao_id_cover) → nada novo.
--  (B) simulado_pasta_estudantes (824 chamadas/min, ~7 ms) → o motor de acesso do aluno lia TODAS as
--      atribuições de TODOS os alunos a cada requisição; agora lê só as do aluno + 1 RPC (cache 60 s).
-- Idempotente, sem CONCURRENTLY. Após aplicar: NOTIFY pgrst, 'reload schema';

-- (B) índice por aluno (pasta_estudantes só tinha índices liderados por pasta_id/tenant_id).
CREATE INDEX IF NOT EXISTS ix_pasta_estud_estudante
  ON public.simulado_pasta_estudantes (estudante_id, pasta_id) INCLUDE (tenant_id);

-- (B) ids de nós (pasta/doc) com ≥1 atribuição de ALUNO no tenant. Index-only scan; devolve uuid[] (sem teto de linhas do PostgREST).
CREATE OR REPLACE FUNCTION public.fn_ids_com_atribuicao_estudante(p_tenant uuid, p_tipo text)
RETURNS uuid[]
LANGUAGE plpgsql STABLE
AS $$
BEGIN
  IF p_tipo = 'pasta' THEN
    RETURN COALESCE((SELECT array_agg(DISTINCT pasta_id) FROM public.simulado_pasta_estudantes WHERE tenant_id = p_tenant), '{}'::uuid[]);
  ELSIF p_tipo = 'doc' THEN
    RETURN COALESCE((SELECT array_agg(DISTINCT documento_id) FROM public.simulado_conteudo_documento_estudantes WHERE tenant_id = p_tenant), '{}'::uuid[]);
  END IF;
  RETURN '{}'::uuid[];
END $$;

-- (A) Turma (aluno×turma): acerto agregado por questão, só sessões reais (exclui teste/deletadas). Mesmo critério do caminho SQL.
CREATE OR REPLACE FUNCTION public.fn_turma_resp_por_questao(p_qids uuid[])
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('questao_id', x.questao_id, 'tt', x.tt, 'ac', x.ac)), '[]'::jsonb)
  FROM (
    SELECT r.questao_id, COUNT(*)::int AS tt, COUNT(*) FILTER (WHERE r.correta)::int AS ac
    FROM public.simulado_respostas_objetivas r
    JOIN public.simulado_sessoes_prova s ON s.id = r.sessao_id AND s.is_teste = false AND s.deletado = false
    WHERE r.questao_id = ANY (p_qids)
    GROUP BY r.questao_id
  ) x
$$;

-- (A) Disciplina: agregado por (simulado, assunto, ano, mês UTC) + estudantes distintos, p/ um lote de questões.
CREATE OR REPLACE FUNCTION public.fn_disciplina_resp_agg(p_qids uuid[])
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  WITH base AS (
    SELECT r.correta, s.simulado_id, s.estudante_id, s.iniciado_em, q.assunto_id
    FROM public.simulado_respostas_objetivas r
    JOIN public.simulado_questoes q ON q.id = r.questao_id
    JOIN public.simulado_sessoes_prova s ON s.id = r.sessao_id AND s.is_teste = false AND s.deletado = false
    WHERE r.questao_id = ANY (p_qids)
  )
  SELECT jsonb_build_object(
    'por', COALESCE((SELECT jsonb_agg(jsonb_build_object('simulado_id', g.simulado_id, 'assunto_id', g.assunto_id, 'y', g.y, 'm0', g.m0, 'tt', g.tt, 'ac', g.ac))
                     FROM (SELECT simulado_id, assunto_id,
                                  EXTRACT(YEAR FROM iniciado_em AT TIME ZONE 'UTC')::int AS y,
                                  (EXTRACT(MONTH FROM iniciado_em AT TIME ZONE 'UTC')::int - 1) AS m0,
                                  COUNT(*)::int AS tt, COUNT(*) FILTER (WHERE correta)::int AS ac
                             FROM base GROUP BY 1, 2, 3, 4) g), '[]'::jsonb),
    'est', COALESCE((SELECT jsonb_agg(DISTINCT estudante_id) FROM base), '[]'::jsonb)
  )
$$;
