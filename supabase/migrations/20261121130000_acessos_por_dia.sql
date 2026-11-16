-- ACESSOS AGRUPADOS POR DIA (fuso BRT) — aluno e equipe. Agregação no BANCO (backend-first), paginada.
-- Cria (idempotente, só service role):
--   * simulado_aluno_acessos_por_dia(...)  — 1 linha por dia: nº de sessões, 1º/último horário, tempo real do dia,
--                                            IPs e aparelhos distintos (mais usados primeiro), páginas vistas, "alguma ativa?".
--   * simulado_admin_acessos_por_dia(...)  — idem para a equipe (simulado_admin_sessoes).
-- Tempo da sessão = max(último visto − início, soma de duracao_seg dos eventos tempo_pagina), teto 12 h por sessão.
-- Sessões de visualização de admin (impersonação) NÃO entram na agregação do aluno.
-- Retorno: jsonb { total, rows:[{dia, sessoes, primeiro, ultimo, tempo_seg, ips[], aparelhos[], paginas, ativa}] }.
-- Requer as migrações 20261118010000 / 20261120010000 (aluno) e 20261121100000 (equipe).
-- Aplicar manualmente (SQL editor). Sem esta migração o app agrupa em memória (até 2000 sessões).

-- Pré-requisito (idempotente): colunas do rastreio de aluno (também criadas em 20261120010000_rastreio_aluno_total.sql).
alter table public.simulado_aluno_atividades add column if not exists duracao_seg int;
alter table public.simulado_aluno_atividades add column if not exists rota text;

create or replace function public.simulado_aluno_acessos_por_dia(
  p_tenant uuid, p_estudante uuid, p_desde timestamptz,
  p_metodo text default null, p_q text default null,
  p_sort text default 'dia', p_dir text default 'desc', p_limit int default 10, p_offset int default 0
) returns jsonb language sql stable security definer set search_path = public as $$
  with par as (select nullif(btrim(coalesce(p_q, '')), '') as q),
  s as (
    select a.id, (a.iniciado_em at time zone 'America/Sao_Paulo')::date as dia, a.iniciado_em, a.ultimo_visto_em, a.encerrado_em,
           nullif(regexp_replace(coalesce(a.ip, ''), '^::ffff:', '', 'i'), '') as ip,
           nullif(concat_ws(' · ', nullif(a.navegador, ''), nullif(a.so, '')), '') as aparelho
      from public.simulado_aluno_acessos a, par
     where a.tenant_id = p_tenant and a.estudante_id = p_estudante and a.impersonado_por is null and a.iniciado_em >= p_desde
       and (coalesce(p_metodo, '') = '' or a.metodo = p_metodo)
       and (par.q is null or a.ip ilike '%' || par.q || '%' or a.navegador ilike '%' || par.q || '%' or a.so ilike '%' || par.q || '%')
  ),
  t as (
    select x.acesso_id, sum(x.duracao_seg)::int as seg
      from public.simulado_aluno_atividades x
     where x.tenant_id = p_tenant and x.estudante_id = p_estudante and x.tipo = 'tempo_pagina'
       and x.criado_em >= p_desde and x.acesso_id is not null
     group by x.acesso_id
  ),
  sd as (
    select s.*, least(greatest(extract(epoch from (s.ultimo_visto_em - s.iniciado_em))::int, coalesce(t.seg, 0)), 43200) as seg_total
      from s left join t on t.acesso_id = s.id
  ),
  pv as (
    select (x.criado_em at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as n
      from public.simulado_aluno_atividades x
     where x.tenant_id = p_tenant and x.estudante_id = p_estudante and x.tipo = 'pagina_vista' and x.criado_em >= p_desde
     group by 1
  ),
  d as (
    select sd.dia, count(*)::int as sessoes, min(sd.iniciado_em) as primeiro, max(sd.ultimo_visto_em) as ultimo,
           sum(sd.seg_total)::int as tempo_seg,
           coalesce(bool_or(sd.encerrado_em is null and sd.ultimo_visto_em > now() - interval '30 minutes'), false) as ativa,
           coalesce((select pv.n from pv where pv.dia = sd.dia), 0) as paginas,
           coalesce((select jsonb_agg(z.v order by z.c desc, z.v) from (select y.ip as v, count(*) as c from sd y where y.dia = sd.dia and y.ip is not null group by y.ip order by count(*) desc limit 8) z), '[]'::jsonb) as ips,
           coalesce((select jsonb_agg(z.v order by z.c desc, z.v) from (select y.aparelho as v, count(*) as c from sd y where y.dia = sd.dia and y.aparelho is not null group by y.aparelho order by count(*) desc limit 8) z), '[]'::jsonb) as aparelhos
      from sd group by sd.dia
  ),
  pg as (
    select d.*, row_number() over (order by
             case when p_sort = 'sessoes' and p_dir = 'asc' then d.sessoes end asc,
             case when p_sort = 'sessoes' and p_dir <> 'asc' then d.sessoes end desc,
             case when p_sort = 'tempo' and p_dir = 'asc' then d.tempo_seg end asc,
             case when p_sort = 'tempo' and p_dir <> 'asc' then d.tempo_seg end desc,
             case when p_dir = 'asc' then d.dia end asc,
             d.dia desc) as ord
      from d
  ),
  pagina as (
    select * from pg order by ord
     limit greatest(1, least(coalesce(p_limit, 10), 100)) offset greatest(0, coalesce(p_offset, 0))
  )
  select jsonb_build_object(
    'total', (select count(*) from d),
    'rows', coalesce((select jsonb_agg(to_jsonb(pagina) - 'ord' order by pagina.ord) from pagina), '[]'::jsonb)
  );
$$;

create or replace function public.simulado_admin_acessos_por_dia(
  p_tenant uuid, p_user uuid, p_desde timestamptz,
  p_q text default null,
  p_sort text default 'dia', p_dir text default 'desc', p_limit int default 10, p_offset int default 0
) returns jsonb language sql stable security definer set search_path = public as $$
  with par as (select nullif(btrim(coalesce(p_q, '')), '') as q),
  s as (
    select a.id, (a.iniciado_em at time zone 'America/Sao_Paulo')::date as dia, a.iniciado_em, a.ultimo_visto_em, a.encerrado_em, a.tempo_ativo_seg,
           nullif(regexp_replace(coalesce(a.ip, ''), '^::ffff:', '', 'i'), '') as ip,
           nullif(concat_ws(' · ', nullif(a.navegador, ''), nullif(a.so, '')), '') as aparelho
      from public.simulado_admin_sessoes a, par
     where a.tenant_id = p_tenant and a.user_id = p_user and a.iniciado_em >= p_desde
       and (par.q is null or a.ip ilike '%' || par.q || '%' or a.navegador ilike '%' || par.q || '%' or a.so ilike '%' || par.q || '%')
  ),
  t as (
    select x.sessao_id, sum(x.duracao_seg)::int as seg
      from public.simulado_admin_atividades x
     where x.tenant_id = p_tenant and x.user_id = p_user and x.tipo = 'tempo_pagina' and x.criado_em >= p_desde and x.sessao_id is not null
     group by x.sessao_id
  ),
  sd as (
    select s.*, least(greatest(extract(epoch from (s.ultimo_visto_em - s.iniciado_em))::int, coalesce(s.tempo_ativo_seg, 0), coalesce(t.seg, 0)), 43200) as seg_total
      from s left join t on t.sessao_id = s.id
  ),
  pv as (
    select (x.criado_em at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as n
      from public.simulado_admin_atividades x
     where x.tenant_id = p_tenant and x.user_id = p_user and x.tipo = 'pagina_vista' and x.criado_em >= p_desde
     group by 1
  ),
  d as (
    select sd.dia, count(*)::int as sessoes, min(sd.iniciado_em) as primeiro, max(sd.ultimo_visto_em) as ultimo,
           sum(sd.seg_total)::int as tempo_seg,
           coalesce(bool_or(sd.encerrado_em is null and sd.ultimo_visto_em > now() - interval '3 minutes'), false) as ativa,
           coalesce((select pv.n from pv where pv.dia = sd.dia), 0) as paginas,
           coalesce((select jsonb_agg(z.v order by z.c desc, z.v) from (select y.ip as v, count(*) as c from sd y where y.dia = sd.dia and y.ip is not null group by y.ip order by count(*) desc limit 8) z), '[]'::jsonb) as ips,
           coalesce((select jsonb_agg(z.v order by z.c desc, z.v) from (select y.aparelho as v, count(*) as c from sd y where y.dia = sd.dia and y.aparelho is not null group by y.aparelho order by count(*) desc limit 8) z), '[]'::jsonb) as aparelhos
      from sd group by sd.dia
  ),
  pg as (
    select d.*, row_number() over (order by
             case when p_sort = 'sessoes' and p_dir = 'asc' then d.sessoes end asc,
             case when p_sort = 'sessoes' and p_dir <> 'asc' then d.sessoes end desc,
             case when p_sort = 'tempo' and p_dir = 'asc' then d.tempo_seg end asc,
             case when p_sort = 'tempo' and p_dir <> 'asc' then d.tempo_seg end desc,
             case when p_dir = 'asc' then d.dia end asc,
             d.dia desc) as ord
      from d
  ),
  pagina as (
    select * from pg order by ord
     limit greatest(1, least(coalesce(p_limit, 10), 100)) offset greatest(0, coalesce(p_offset, 0))
  )
  select jsonb_build_object(
    'total', (select count(*) from d),
    'rows', coalesce((select jsonb_agg(to_jsonb(pagina) - 'ord' order by pagina.ord) from pagina), '[]'::jsonb)
  );
$$;

revoke all on function public.simulado_aluno_acessos_por_dia(uuid, uuid, timestamptz, text, text, text, text, int, int) from public, anon, authenticated;
revoke all on function public.simulado_admin_acessos_por_dia(uuid, uuid, timestamptz, text, text, text, int, int) from public, anon, authenticated;
