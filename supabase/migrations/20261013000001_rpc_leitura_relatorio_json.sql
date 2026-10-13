-- Relatório da leitura em UMA linha (jsonb) — agrega TUDO no banco (como o rpc_leitura_ranking_json),
-- eliminando o pull de ~12k respostas + ~10k XP pro app (causa do relatório "pesado / não abre").
-- Devolve { por_aluno:[{estudante_id,aulas_concluidas,pontos,dias[]}], por_dia:[{dia,alunos,aulas}],
--           por_aula:[{documento_id,concluiram,leitura_med,quiz_med}] }.
-- A sequência (streak) é calculada no app a partir de `dias[]` (respeita os ajustes manuais do suporte).
create or replace function public.rpc_leitura_relatorio_json(p_tenant uuid, p_docs uuid[], p_tz text)
returns jsonb language sql stable as $$
  with quiz as (
    select documento_id, count(*) as total_q
    from public.simulado_documento_quiz_questoes
    where tenant_id = p_tenant and deletado = false and documento_id = any(p_docs)
    group by documento_id
  ),
  cel as (
    select r.estudante_id, r.documento_id,
           count(distinct r.questao_id) as answered,
           min(r.respondido_em) as primeira,
           max(r.respondido_em) as ultima
    from public.simulado_leitura_respostas r
    join public.simulado_documento_quiz_questoes q
      on q.tenant_id = r.tenant_id and q.documento_id = r.documento_id
     and q.questao_id = r.questao_id and q.deletado = false
    where r.tenant_id = p_tenant and r.documento_id = any(p_docs)
    group by r.estudante_id, r.documento_id
  ),
  prog as (
    select estudante_id, documento_id,
           coalesce(tempo_seg, greatest(0, floor(extract(epoch from (concluido_em - iniciado_em)))::int)) as leitura_seg
    from public.simulado_leitura_progresso
    where tenant_id = p_tenant and documento_id = any(p_docs)
  ),
  feitas as ( -- (aluno, doc) com o quiz COMPLETO (respondeu todas as questões do quiz do doc)
    select c.estudante_id, c.documento_id,
           to_char((c.ultima at time zone p_tz)::date, 'YYYY-MM-DD') as dia,
           greatest(0, floor(extract(epoch from (c.ultima - c.primeira)))::int) as quiz_seg,
           coalesce(p.leitura_seg, 0) as leitura_seg
    from cel c
    join quiz qz on qz.documento_id = c.documento_id
    left join prog p on p.estudante_id = c.estudante_id and p.documento_id = c.documento_id
    where c.answered >= qz.total_q and qz.total_q > 0
  ),
  xpa as (
    select estudante_id, coalesce(sum(xp),0)::int as pontos
    from public.simulado_xp_eventos
    where tenant_id = p_tenant and origem = 'leitura'
      and (ref_id = any(p_docs::text[]) or ref_id = any(array(select 'quiz:'||d::text from unnest(p_docs) d)))
    group by estudante_id
  ),
  por_aluno as (
    select f.estudante_id,
           count(*)::int as aulas_concluidas,
           coalesce(max(x.pontos),0)::int as pontos,
           array_remove(array_agg(distinct f.dia), null) as dias
    from feitas f
    left join xpa x on x.estudante_id = f.estudante_id
    group by f.estudante_id
  ),
  por_dia as (
    select f.dia, count(distinct f.estudante_id)::int as alunos, count(*)::int as aulas
    from feitas f group by f.dia
  ),
  por_aula as (
    select f.documento_id,
           count(*)::int as concluiram,
           coalesce(round(avg(nullif(f.leitura_seg,0)))::int,0) as leitura_med,
           coalesce(round(avg(nullif(f.quiz_seg,0)))::int,0) as quiz_med
    from feitas f group by f.documento_id
  )
  select jsonb_build_object(
    'por_aluno', coalesce((select jsonb_agg(jsonb_build_object('estudante_id',estudante_id,'aulas_concluidas',aulas_concluidas,'pontos',pontos,'dias',to_jsonb(dias))) from por_aluno), '[]'::jsonb),
    'por_dia',   coalesce((select jsonb_agg(jsonb_build_object('dia',dia,'alunos',alunos,'aulas',aulas) order by dia) from por_dia), '[]'::jsonb),
    'por_aula',  coalesce((select jsonb_agg(jsonb_build_object('documento_id',documento_id,'concluiram',concluiram,'leitura_med',leitura_med,'quiz_med',quiz_med)) from por_aula), '[]'::jsonb)
  );
$$;

-- PostgREST: recarrega o schema cache para enxergar a função nova.
notify pgrst, 'reload schema';
