-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — relatório por aluno com ORDENAÇÃO e FILTRO DE ANDAMENTO no banco
--
-- A função original (simulado_cronograma_relatorio_alunos) só ordena por "última emissão".
-- Esta v2 mantém a mesma agregação e adiciona p_ordem/p_dir e p_situacao, para a sub-aba
-- "Relatórios" do Gerador (admin/revisao/cronograma) ordenar e filtrar no servidor, sem trazer
-- os ~14 mil alunos. Aditiva: não altera nem remove a função original.
--   p_ordem:    nome | emissoes | ultima | progresso   (padrão: ultima)
--   p_dir:      asc | desc                              (padrão: desc)
--   p_situacao: completo | andamento | sem_progresso | NULL (todos)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.simulado_cronograma_relatorio_alunos_v2(
  p_tenant uuid, p_busca text DEFAULT NULL, p_ordem text DEFAULT 'ultima', p_dir text DEFAULT 'desc',
  p_situacao text DEFAULT NULL, p_limite int DEFAULT 50, p_offset int DEFAULT 0
) RETURNS TABLE (
  estudante_id uuid, nome text, email text,
  emissoes bigint, ultima timestamptz, concluidas bigint, planejadas bigint, total_linhas bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mt AS (
    SELECT cronograma_id, count(*)::bigint n
    FROM public.simulado_cronograma_metas WHERE tenant_id = p_tenant GROUP BY cronograma_id
  ),
  em AS (
    SELECT e.id, e.estudante_id, e.cronograma_id, e.criado_em
    FROM public.simulado_cronograma_emissoes e
    WHERE e.tenant_id = p_tenant AND e.is_teste = false
  ),
  ck AS (
    SELECT emissao_id, count(*)::bigint n
    FROM public.simulado_cronograma_meta_checks WHERE tenant_id = p_tenant GROUP BY emissao_id
  ),
  agg AS (
    SELECT
      em.estudante_id,
      es.nome,
      es.email,
      count(DISTINCT em.id)::bigint AS emissoes,
      max(em.criado_em) AS ultima,
      coalesce(sum(ck.n), 0)::bigint AS concluidas,
      coalesce(sum(mt.n), 0)::bigint AS planejadas
    FROM em
    JOIN public.simulado_estudantes es ON es.id = em.estudante_id
    LEFT JOIN mt ON mt.cronograma_id = em.cronograma_id
    LEFT JOIN ck ON ck.emissao_id = em.id
    WHERE p_busca IS NULL OR p_busca = ''
       OR es.nome ILIKE '%' || p_busca || '%'
       OR coalesce(es.email, '') ILIKE '%' || p_busca || '%'
    GROUP BY em.estudante_id, es.nome, es.email
  ),
  filtrado AS (
    SELECT * FROM agg
    WHERE p_situacao IS NULL OR p_situacao = ''
       OR (p_situacao = 'sem_progresso' AND agg.concluidas = 0)
       OR (p_situacao = 'andamento' AND agg.concluidas > 0 AND agg.concluidas < agg.planejadas)
       OR (p_situacao = 'completo' AND agg.planejadas > 0 AND agg.concluidas >= agg.planejadas)
  )
  SELECT f.*, count(*) OVER ()::bigint
  FROM filtrado f
  ORDER BY
    CASE WHEN p_ordem = 'nome' AND p_dir = 'asc' THEN f.nome END ASC,
    CASE WHEN p_ordem = 'nome' AND p_dir = 'desc' THEN f.nome END DESC,
    CASE WHEN p_ordem = 'emissoes' AND p_dir = 'asc' THEN f.emissoes END ASC,
    CASE WHEN p_ordem = 'emissoes' AND p_dir = 'desc' THEN f.emissoes END DESC,
    CASE WHEN p_ordem = 'progresso' AND p_dir = 'asc' THEN f.concluidas::numeric / nullif(f.planejadas, 0) END ASC NULLS LAST,
    CASE WHEN p_ordem = 'progresso' AND p_dir = 'desc' THEN f.concluidas::numeric / nullif(f.planejadas, 0) END DESC NULLS LAST,
    CASE WHEN p_ordem = 'ultima' AND p_dir = 'asc' THEN f.ultima END ASC,
    f.ultima DESC,
    f.estudante_id
  LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

DO $$
DECLARE r text;
BEGIN
  EXECUTE 'REVOKE ALL ON FUNCTION public.simulado_cronograma_relatorio_alunos_v2(uuid,text,text,text,text,int,int) FROM public';
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.simulado_cronograma_relatorio_alunos_v2(uuid,text,text,text,text,int,int) FROM %I', r);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.simulado_cronograma_relatorio_alunos_v2(uuid,text,text,text,text,int,int) TO service_role';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
