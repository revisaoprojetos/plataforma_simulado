-- Agregação do RANKING da leitura NO BANCO (evita puxar ~61k respostas pro app → era ~29s).
-- Devolve 1 linha por aluno: acertos, aulas concluídas/gabaritadas e os DIAS de conclusão (no fuso
-- do tenant) — o app só aplica os overrides (ajuste manual) + calcula o streak em cima disso.
-- `concluída` = respondeu TODAS as questões do quiz da aula; `dia` = data (fuso) da última resposta.
create or replace function public.rpc_leitura_ranking(p_tenant uuid, p_docs uuid[], p_tz text)
returns table(estudante_id uuid, acertos int, aulas_concluidas int, aulas_gabaritadas int, dias text[])
language sql stable as $$
  with quiz as (
    select documento_id, count(*) as total_q
    from public.simulado_documento_quiz_questoes
    where tenant_id = p_tenant and deletado = false and documento_id = any(p_docs)
    group by documento_id
  ),
  cel as (
    select r.estudante_id, r.documento_id,
           count(distinct r.questao_id) as answered,
           count(distinct r.questao_id) filter (where r.correta) as correct,
           max(r.respondido_em) as ultima
    from public.simulado_leitura_respostas r
    join public.simulado_documento_quiz_questoes q
      on q.tenant_id = r.tenant_id and q.documento_id = r.documento_id
     and q.questao_id = r.questao_id and q.deletado = false
    where r.tenant_id = p_tenant and r.documento_id = any(p_docs)
    group by r.estudante_id, r.documento_id
  ),
  agg as (
    select c.estudante_id, c.correct, c.ultima,
           (c.answered >= qz.total_q and qz.total_q > 0) as concluida,
           (c.correct  >= qz.total_q and qz.total_q > 0) as gabaritada
    from cel c join quiz qz on qz.documento_id = c.documento_id
  )
  select a.estudante_id,
         coalesce(sum(a.correct), 0)::int as acertos,
         count(*) filter (where a.concluida)::int as aulas_concluidas,
         count(*) filter (where a.gabaritada)::int as aulas_gabaritadas,
         array_remove(array_agg(distinct case when a.concluida
           then to_char((a.ultima at time zone p_tz)::date, 'YYYY-MM-DD') end), null) as dias
  from agg a
  group by a.estudante_id;
$$;
