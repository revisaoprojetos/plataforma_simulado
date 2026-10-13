-- Ranking + Relatório do Desafio de Jurisprudência agregados no BANCO (1 query, jsonb compacto) —
-- blinda a escala ("se ficar lotado"): evita puxar o progresso inteiro (1 linha jsonb/aluno) + varrer
-- o ledger no app. Recebe os dias do desafio (p_dias) e o nº de teses por dia (p_teses) do jsonb
-- desafio_jogo (que NÃO é tabela). Devolve:
--   { por_aluno:[{estudante_id,pontos,dominados,dias[],atualizado_em}], por_dia:[{dia,alunos}] }
--   pontos    = soma dos melhores pontos por dia (best)
--   dominados = nº de dias com TODAS as teses dominadas (dom)
--   dias      = dias de atividade do ledger (p/ a sequência, calculada no app)
--   por_dia   = quantos alunos DOMINARAM cada dia (adesão do relatório)
create or replace function public.rpc_juris_relatorio_json(p_tenant uuid, p_desafio uuid, p_dias text[], p_teses jsonb)
returns jsonb language sql stable as $$
  with prog as (
    select estudante_id, dom, best, atualizado_em
    from public.simulado_jurisprudencia_progresso
    where desafio_id = p_desafio
  ),
  cell as ( -- (aluno, dia): pontos do dia + se dominou (todas as teses)
    select pr.estudante_id, dd as dia,
           greatest(0, coalesce((pr.best ->> dd)::numeric, 0))::int as pontos,
           (coalesce((p_teses ->> dd)::int, 0) > 0
            and jsonb_typeof(pr.dom -> dd) = 'array'
            and jsonb_array_length(pr.dom -> dd) >= (p_teses ->> dd)::int) as dominou
    from prog pr cross join unnest(p_dias) as dd
  ),
  pa as (
    select c.estudante_id,
           coalesce(sum(c.pontos), 0)::int as pontos,
           count(*) filter (where c.dominou)::int as dominados
    from cell c group by c.estudante_id
  ),
  led as (
    select estudante_id, array_remove(array_agg(distinct meta->>'dia'), null) as dias
    from public.simulado_xp_eventos
    where tenant_id = p_tenant and origem = 'jurisprudencia' and meta->>'desafio' = p_desafio::text
    group by estudante_id
  ),
  por_aluno as (
    select pr.estudante_id,
           coalesce(pa.pontos, 0) as pontos,
           coalesce(pa.dominados, 0) as dominados,
           coalesce(led.dias, '{}'::text[]) as dias,
           pr.atualizado_em
    from prog pr
    left join pa on pa.estudante_id = pr.estudante_id
    left join led on led.estudante_id = pr.estudante_id
  ),
  por_dia as (
    select c.dia, count(*) filter (where c.dominou)::int as alunos
    from cell c group by c.dia
  )
  select jsonb_build_object(
    'por_aluno', coalesce((select jsonb_agg(jsonb_build_object('estudante_id',estudante_id,'pontos',pontos,'dominados',dominados,'dias',to_jsonb(dias),'atualizado_em',atualizado_em)) from por_aluno), '[]'::jsonb),
    'por_dia',   coalesce((select jsonb_agg(jsonb_build_object('dia',dia,'alunos',alunos)) from por_dia), '[]'::jsonb)
  );
$$;

notify pgrst, 'reload schema';
