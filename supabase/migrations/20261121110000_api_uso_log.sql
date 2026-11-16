-- RASTREIO DE USO DA API PÚBLICA (API keys): quem chamou, qual chave, qual recurso, IP, UA, status, latência,
-- se foi barrado por rate limit. Alimenta a aba "Uso" de /admin/api-keys. Idempotente. Aplicar manualmente.
-- LGPD: IP/UA são dado pessoal → só service role (RLS ligado, sem policies, sem grants p/ anon/authenticated).
-- NUNCA grava a chave nem payload: só o PREFIXO (8 chars) da chave apresentada, quando a chave é desconhecida.
-- Retenção: simulado_api_uso_purgar(dias) (default 180) chamada por /api/cron/api-uso-purge (agendar no worker 1x/dia).

create table if not exists public.simulado_api_uso (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,                                  -- null = chave desconhecida (tentativa sem tenant)
  api_key_id uuid,                                 -- null = chave ausente/inválida (sem FK: histórico sobrevive à chave)
  key_prefix text,                                 -- só os 8 primeiros chars da chave apresentada (nunca a chave)
  recurso text not null,                           -- rota normalizada, ex.: /api/v1/alunos/{id}
  metodo text not null default 'GET',
  rota text,                                       -- pathname (sem query string)
  status int not null,
  duracao_ms int not null default 0,
  ip text,
  user_agent text,
  barrado_limite boolean not null default false,   -- true = 429 do rate limit
  erro text,                                       -- mensagem curta (≤200), sem dados
  request_id text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_api_uso_tenant on public.simulado_api_uso (tenant_id, criado_em desc);
create index if not exists idx_api_uso_key on public.simulado_api_uso (api_key_id, criado_em desc);

alter table public.simulado_api_uso enable row level security;
revoke all on public.simulado_api_uso from anon, authenticated;

-- Resumo em UMA chamada: totais + p50/p95 + por recurso + por chave.
-- "erros" = status >= 400 que NÃO foi barrado por limite (barradas contam à parte).
create or replace function public.api_uso_resumo(p_tenant uuid, p_dias int default 30)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with params as (
    select p_tenant as t, now() - make_interval(days => greatest(1, least(coalesce(p_dias, 30), 365))) as desde
  ),
  base as (
    select u.* from public.simulado_api_uso u, params p
    where u.tenant_id = p.t and u.criado_em >= p.desde
  ),
  tot as (
    select count(*)::int as chamadas,
           count(*) filter (where status >= 400 and not barrado_limite)::int as erros,
           count(*) filter (where barrado_limite)::int as barradas,
           coalesce(percentile_cont(0.5) within group (order by duracao_ms), 0)::int as p50,
           coalesce(percentile_cont(0.95) within group (order by duracao_ms), 0)::int as p95
    from base
  ),
  rec as (
    select recurso,
           count(*)::int as chamadas,
           count(*) filter (where status >= 400 and not barrado_limite)::int as erros,
           coalesce(percentile_cont(0.5) within group (order by duracao_ms), 0)::int as p50,
           coalesce(percentile_cont(0.95) within group (order by duracao_ms), 0)::int as p95
    from base group by recurso order by count(*) desc limit 50
  ),
  ch as (
    select k.id, k.nome, k.key_prefix, k.revogada,
           count(b.id)::int as chamadas,
           count(b.id) filter (where b.barrado_limite)::int as barradas,
           count(b.id) filter (where b.status >= 400 and not b.barrado_limite)::int as erros,
           max(b.criado_em) as ultimo_uso_log,
           k.ultimo_uso
    from public.simulado_api_keys k
    left join base b on b.api_key_id = k.id
    where k.tenant_id = (select t from params)
    group by k.id, k.nome, k.key_prefix, k.revogada, k.ultimo_uso
  )
  select jsonb_build_object(
    'dias', greatest(1, least(coalesce(p_dias, 30), 365)),
    'totais', (select to_jsonb(tot) from tot),
    'por_recurso', coalesce((select jsonb_agg(to_jsonb(rec) order by rec.chamadas desc) from rec), '[]'::jsonb),
    'por_chave', coalesce((select jsonb_agg(to_jsonb(ch) order by ch.chamadas desc, ch.nome) from ch), '[]'::jsonb)
  );
$$;

revoke all on function public.api_uso_resumo(uuid, int) from public, anon, authenticated;

-- Retenção (LGPD): apaga registros mais antigos que `dias` (mínimo 30). Retorna quantas linhas apagou.
create or replace function public.simulado_api_uso_purgar(dias int default 180)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  delete from public.simulado_api_uso where criado_em < now() - make_interval(days => greatest(30, coalesce(dias, 180)));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.simulado_api_uso_purgar(int) from public, anon, authenticated;
