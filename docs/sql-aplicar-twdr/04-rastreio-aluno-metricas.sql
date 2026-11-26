-- =====================================================================================================================
-- 04-rastreio-aluno-metricas — colunas duracao_seg/rota, simulado_aluno_metricas_dia, rollup/painel/purgar (origem 20261120010000)
-- Projeto alvo: twdrtlxkjvunkdobudev (SQL Editor do Supabase). Cole numa ABA NOVA e rode inteiro (o Editor já usa transação).
-- Idempotente. Sem CONCURRENTLY/VACUUM. Risco: BAIXO-MÉDIO (2 índices em simulado_aluno_atividades, ~375k linhas/172 MB: segundos, bloqueia escrita nela)
-- Ver LEIAME.md (ordem, verificação).
-- =====================================================================================================================
SET LOCAL lock_timeout = '15s';

-- RASTREIO TOTAL DO ALUNO (complementa 20261118010000). Idempotente. NAO apaga dados.
--  * simulado_aluno_atividades: + duracao_seg (tempo de permanencia) e rota (normalizada, sem query/ids).
--  * indices p/ o painel de metricas.
--  * simulado_aluno_metricas_dia: agregado diario por aluno (sobrevive ao purge; sem IP/UA).
--  * simulado_aluno_metricas_rollup(): recalcula os dias (idempotente); o purge chama antes de apagar.
--  * simulado_aluno_metricas_painel(): agregacao p/ o painel admin (servidor), 1 chamada.
-- Aplicar manualmente (SQL editor).

alter table public.simulado_aluno_atividades add column if not exists duracao_seg int;
alter table public.simulado_aluno_atividades add column if not exists rota text;

create index if not exists idx_aluno_ativ_tenant_tipo on public.simulado_aluno_atividades (tenant_id, tipo, criado_em desc);
create index if not exists idx_aluno_ativ_est_tipo on public.simulado_aluno_atividades (estudante_id, tipo, criado_em desc);

create table if not exists public.simulado_aluno_metricas_dia (
  tenant_id uuid not null,
  estudante_id uuid not null references public.simulado_estudantes(id) on delete cascade,
  dia date not null,
  acessos int not null default 0,
  atividades int not null default 0,
  tempo_seg int not null default 0,
  por_tipo jsonb not null default '{}'::jsonb,
  primary key (tenant_id, estudante_id, dia)
);
create index if not exists idx_aluno_metricas_dia on public.simulado_aluno_metricas_dia (tenant_id, dia desc);

alter table public.simulado_aluno_metricas_dia enable row level security;
drop policy if exists tenant_isolation on public.simulado_aluno_metricas_dia;
create policy tenant_isolation on public.simulado_aluno_metricas_dia
  using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Rollup diario (fuso BRT). Recalcula (substitui) os dias entre p_de e p_ate (exclusivo). Ignora impersonacao.
create or replace function public.simulado_aluno_metricas_rollup(p_de timestamptz, p_ate timestamptz)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare n bigint;
begin
  with ativ as (
    select tenant_id, estudante_id, (criado_em at time zone 'America/Sao_Paulo')::date as dia, tipo,
           count(*) as c, coalesce(sum(duracao_seg) filter (where tipo = 'tempo_pagina'), 0) as t
      from public.simulado_aluno_atividades
     where criado_em >= p_de and criado_em < p_ate and not (meta ? 'impersonado_por')
     group by 1, 2, 3, 4
  ), ativ_dia as (
    select tenant_id, estudante_id, dia, sum(c)::int as atividades, sum(t)::int as tempo_seg,
           jsonb_object_agg(tipo, c) as por_tipo
      from ativ group by 1, 2, 3
  ), ac as (
    select tenant_id, estudante_id, (iniciado_em at time zone 'America/Sao_Paulo')::date as dia, count(*)::int as acessos
      from public.simulado_aluno_acessos
     where iniciado_em >= p_de and iniciado_em < p_ate and impersonado_por is null
     group by 1, 2, 3
  ), j as (
    select coalesce(a.tenant_id, c.tenant_id) as tenant_id, coalesce(a.estudante_id, c.estudante_id) as estudante_id,
           coalesce(a.dia, c.dia) as dia, coalesce(c.acessos, 0) as acessos, coalesce(a.atividades, 0) as atividades,
           coalesce(a.tempo_seg, 0) as tempo_seg, coalesce(a.por_tipo, '{}'::jsonb) as por_tipo
      from ativ_dia a full join ac c on c.tenant_id = a.tenant_id and c.estudante_id = a.estudante_id and c.dia = a.dia
  )
  insert into public.simulado_aluno_metricas_dia as m (tenant_id, estudante_id, dia, acessos, atividades, tempo_seg, por_tipo)
  select tenant_id, estudante_id, dia, acessos, atividades, tempo_seg, por_tipo from j
  on conflict (tenant_id, estudante_id, dia) do update
    set acessos = excluded.acessos, atividades = excluded.atividades, tempo_seg = excluded.tempo_seg, por_tipo = excluded.por_tipo;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.simulado_aluno_metricas_rollup(timestamptz, timestamptz) from public, anon, authenticated;

-- Purge: ANTES de apagar, consolida em metricas_dia o que vai sair (agregados diarios sao mantidos).
create or replace function public.simulado_aluno_registro_purgar(dias int default 180)
returns table (atividades bigint, acessos bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  corte timestamptz := now() - make_interval(days => greatest(dias, 30));
  a bigint; b bigint;
begin
  perform public.simulado_aluno_metricas_rollup(corte - interval '400 days', corte);
  delete from public.simulado_aluno_atividades where criado_em < corte;
  get diagnostics a = row_count;
  delete from public.simulado_aluno_acessos where ultimo_visto_em < corte;
  get diagnostics b = row_count;
  return query select a, b;
end $$;
revoke all on function public.simulado_aluno_registro_purgar(int) from public, anon, authenticated;

-- Painel admin: tudo agregado no banco (BRT).
create or replace function public.simulado_aluno_metricas_painel(p_tenant uuid, p_desde timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with at as (
    select estudante_id, tipo, rota, ref_id, duracao_seg, criado_em
      from public.simulado_aluno_atividades
     where tenant_id = p_tenant and criado_em >= p_desde and not (meta ? 'impersonado_por')
  ), ac as (
    select estudante_id, iniciado_em from public.simulado_aluno_acessos
     where tenant_id = p_tenant and iniciado_em >= p_desde and impersonado_por is null
  )
  select jsonb_build_object(
    'por_dia', coalesce((select jsonb_agg(x order by x->>'dia') from (
        select jsonb_build_object('dia', d.dia, 'acessos', d.ac, 'alunos', d.al) as x from (
          select (iniciado_em at time zone 'America/Sao_Paulo')::date as dia, count(*) as ac, count(distinct estudante_id) as al
            from ac group by 1) d) q), '[]'::jsonb),
    'dau', (select count(distinct estudante_id) from ac where iniciado_em >= now() - interval '1 day'),
    'wau', (select count(distinct estudante_id) from ac where iniciado_em >= now() - interval '7 days'),
    'mau', (select count(distinct estudante_id) from ac where iniciado_em >= now() - interval '30 days'),
    'alunos_periodo', (select count(distinct estudante_id) from ac),
    'top_paginas', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('rota', rota, 'vistas', count(*), 'alunos', count(distinct estudante_id)) as x
          from at where tipo = 'pagina_vista' and rota is not null group by rota order by count(*) desc limit 15) q), '[]'::jsonb),
    'tempo_medio_pagina_seg', (select round(avg(duracao_seg))::int from at where tipo = 'tempo_pagina' and duracao_seg > 0),
    'tempo_total_seg', (select coalesce(sum(duracao_seg), 0) from at where tipo = 'tempo_pagina'),
    'por_tipo', coalesce((select jsonb_agg(x) from (
        select jsonb_build_object('tipo', tipo, 'total', count(*)) as x from at group by tipo order by count(*) desc) q), '[]'::jsonb),
    'por_hora', coalesce((select jsonb_agg(x order by (x->>'hora')::int) from (
        select jsonb_build_object('hora', h.hora, 'acessos', count(*)) as x
          from (select extract(hour from iniciado_em at time zone 'America/Sao_Paulo')::int as hora from ac) h
         group by h.hora) q), '[]'::jsonb)
  );
$$;
revoke all on function public.simulado_aluno_metricas_painel(uuid, timestamptz) from public, anon, authenticated;

NOTIFY pgrst, 'reload schema';
