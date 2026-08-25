-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — relatórios de emissão e de andamento
--
-- Tudo agregado no banco, e não é preferência de estilo: emissões e checks crescem por
-- ALUNO, e a plataforma tem ~14 mil. Ler as linhas para contar na aplicação esbarraria no
-- teto de 1.000 do PostgREST — a mesma armadilha que já derrubou a contagem de metas do
-- catálogo e a tela de pacotes. Aqui a resposta é uma linha por aluno, por cronograma ou
-- por dia, e nunca por emissão.
--
-- "Planejadas" = quantas metas o cronograma tem hoje. A grade vista pelo aluno pode ter
-- semanas de revisão e recesso a mais, mas elas NÃO têm meta — o total marcável é o mesmo.
-- Se a equipe reimportar o cronograma, esse denominador muda; o progresso é uma leitura do
-- estado atual, não uma foto do dia da emissão.
--
-- `is_teste` fica de fora em todos: emissão de testador é ensaio da equipe, e contá-la
-- inflaria o número que a coordenação usa para decidir.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- Números do topo.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_relatorio_geral(p_tenant uuid)
RETURNS TABLE (
  emissoes bigint, alunos bigint, cronogramas_usados bigint,
  concluidas bigint, planejadas bigint,
  emissoes_7d bigint, emissoes_30d bigint, alunos_30d bigint
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
  )
  SELECT
    count(*)::bigint,
    count(DISTINCT em.estudante_id)::bigint,
    count(DISTINCT em.cronograma_id)::bigint,
    coalesce(sum(ck.n), 0)::bigint,
    coalesce(sum(mt.n), 0)::bigint,
    count(*) FILTER (WHERE em.criado_em >= now() - interval '7 days')::bigint,
    count(*) FILTER (WHERE em.criado_em >= now() - interval '30 days')::bigint,
    count(DISTINCT em.estudante_id) FILTER (WHERE em.criado_em >= now() - interval '30 days')::bigint
  FROM em
  LEFT JOIN mt ON mt.cronograma_id = em.cronograma_id
  LEFT JOIN ck ON ck.emissao_id = em.id;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Um aluno por linha. `p_busca` filtra por nome ou e-mail; `p_offset`/`p_limite` paginam,
-- para a tela nunca depender de trazer 14 mil linhas de uma vez.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_relatorio_alunos(
  p_tenant uuid, p_busca text DEFAULT NULL, p_limite int DEFAULT 50, p_offset int DEFAULT 0
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
  )
  SELECT agg.*, count(*) OVER ()::bigint
  FROM agg
  ORDER BY agg.ultima DESC
  LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Um cronograma por linha: qual o catálogo entrega de fato, e onde os alunos param.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_relatorio_por_cronograma(p_tenant uuid)
RETURNS TABLE (
  cronograma_id uuid, nome text, carga_horaria numeric,
  emissoes bigint, alunos bigint, concluidas bigint, planejadas bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH mt AS (
    SELECT cronograma_id, count(*)::bigint n
    FROM public.simulado_cronograma_metas WHERE tenant_id = p_tenant GROUP BY cronograma_id
  ),
  em AS (
    SELECT e.id, e.estudante_id, e.cronograma_id, e.cronograma_nome
    FROM public.simulado_cronograma_emissoes e
    WHERE e.tenant_id = p_tenant AND e.is_teste = false
  ),
  ck AS (
    SELECT emissao_id, count(*)::bigint n
    FROM public.simulado_cronograma_meta_checks WHERE tenant_id = p_tenant GROUP BY emissao_id
  )
  SELECT
    em.cronograma_id,
    -- O nome vem do catálogo quando o cronograma ainda existe; o snapshot da emissão cobre
    -- o que já foi excluído, para a linha não virar "(sem nome)".
    coalesce(max(c.nome), max(em.cronograma_nome)),
    max(c.carga_horaria),
    count(DISTINCT em.id)::bigint,
    count(DISTINCT em.estudante_id)::bigint,
    coalesce(sum(ck.n), 0)::bigint,
    coalesce(sum(mt.n), 0)::bigint
  FROM em
  LEFT JOIN public.simulado_cronogramas c ON c.id = em.cronograma_id
  LEFT JOIN mt ON mt.cronograma_id = em.cronograma_id
  LEFT JOIN ck ON ck.emissao_id = em.id
  GROUP BY em.cronograma_id
  ORDER BY count(DISTINCT em.id) DESC;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Série diária de emissões e de metas concluídas — para ver movimento, não só total.
-- generate_series garante os dias VAZIOS: sem eles o gráfico junta 3 dias de silêncio num
-- traço reto e o buraco desaparece.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_relatorio_por_dia(
  p_tenant uuid, p_dias int DEFAULT 30
) RETURNS TABLE (dia date, emissoes bigint, concluidas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH dias AS (
    SELECT generate_series(
      (current_date - (greatest(p_dias, 1) - 1))::date, current_date, interval '1 day'
    )::date AS d
  )
  SELECT
    dias.d,
    (SELECT count(*)::bigint FROM public.simulado_cronograma_emissoes e
      WHERE e.tenant_id = p_tenant AND e.is_teste = false AND e.criado_em::date = dias.d),
    (SELECT count(*)::bigint FROM public.simulado_cronograma_meta_checks k
      WHERE k.tenant_id = p_tenant AND k.marcada_em::date = dias.d)
  FROM dias
  ORDER BY dias.d;
$$;

DO $$
DECLARE r text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'simulado_cronograma_relatorio_geral(uuid)',
    'simulado_cronograma_relatorio_alunos(uuid,text,int,int)',
    'simulado_cronograma_relatorio_por_cronograma(uuid)',
    'simulado_cronograma_relatorio_por_dia(uuid,int)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public;', f);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM %I;', f, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Sem estes, cada relatório varre as tabelas inteiras.
CREATE INDEX IF NOT EXISTS idx_cron_emissoes_tenant_criado
  ON public.simulado_cronograma_emissoes (tenant_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cron_checks_tenant_marcada
  ON public.simulado_cronograma_meta_checks (tenant_id, marcada_em DESC);

NOTIFY pgrst, 'reload schema';
