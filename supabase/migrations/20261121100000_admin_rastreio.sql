-- RASTREIO DE ACESSOS DA EQUIPE (admins) — quem está online, o que acessa, IP, aparelho, página, rota da API, sessão.
-- Cria:
--   * simulado_admin_sessoes     — 1 linha por SESSÃO de admin (IP, aparelho, início, último visto, encerrada, página atual, tempo ativo).
--   * simulado_admin_atividades  — eventos: pagina_vista | tempo_pagina | acao_api | login | logout.
--   * colunas de contexto em simulado_audit_logs (rota, rota_api, request_id, sessao_id, status) — todas NULLABLE.
--   * simulado_admin_rastreio_purgar(dias) — retenção (default 180 dias).
-- LGPD: IP/UA são dado pessoal → acesso só via service role (sem grants p/ anon/authenticated); a leitura passa por
-- páginas/rotas admin com `acessos:view`. Nunca exposto ao aluno. Idempotente; NÃO altera dados existentes.
-- Aplicar manualmente (SQL editor).

create table if not exists public.simulado_admin_sessoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  ip text,
  user_agent text,
  navegador text,
  so text,
  dispositivo text,                       -- desktop|celular|tablet
  rota_atual text,                        -- última página vista (normalizada)
  tempo_ativo_seg integer not null default 0,
  iniciado_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now(),
  encerrado_em timestamptz,
  motivo text                             -- logout|encerrada_admin|expirada|outro
);

create index if not exists idx_adm_sess_tenant_visto on public.simulado_admin_sessoes (tenant_id, ultimo_visto_em desc);
create index if not exists idx_adm_sess_user on public.simulado_admin_sessoes (tenant_id, user_id, iniciado_em desc);
create index if not exists idx_adm_sess_ativas on public.simulado_admin_sessoes (tenant_id, ultimo_visto_em desc) where encerrado_em is null;

create table if not exists public.simulado_admin_atividades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  sessao_id uuid references public.simulado_admin_sessoes(id) on delete set null,
  tipo text not null default 'pagina_vista',   -- pagina_vista|tempo_pagina|acao_api|login|logout
  rota text,                                   -- página (normalizada, ids -> :id)
  rota_api text,                               -- ex.: /api/admin/estudantes/:id
  metodo text,                                 -- GET|POST|PUT|PATCH|DELETE
  status integer,                              -- status HTTP / resultado
  duracao_seg integer,
  ip text,
  request_id text,
  meta jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now()
);

create index if not exists idx_adm_ativ_user on public.simulado_admin_atividades (tenant_id, user_id, criado_em desc);
create index if not exists idx_adm_ativ_tenant on public.simulado_admin_atividades (tenant_id, criado_em desc);
create index if not exists idx_adm_ativ_sessao on public.simulado_admin_atividades (sessao_id);

alter table public.simulado_admin_sessoes enable row level security;
drop policy if exists tenant_isolation on public.simulado_admin_sessoes;
create policy tenant_isolation on public.simulado_admin_sessoes
  using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

alter table public.simulado_admin_atividades enable row level security;
drop policy if exists tenant_isolation on public.simulado_admin_atividades;
create policy tenant_isolation on public.simulado_admin_atividades
  using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Sem acesso direto de anon/authenticated: só service role (que ignora RLS).
revoke all on public.simulado_admin_sessoes from anon, authenticated;
revoke all on public.simulado_admin_atividades from anon, authenticated;

-- Contexto nos eventos de auditoria existentes (tudo nullable; chamadas atuais continuam válidas).
alter table public.simulado_audit_logs add column if not exists rota text;
alter table public.simulado_audit_logs add column if not exists rota_api text;
alter table public.simulado_audit_logs add column if not exists request_id text;
alter table public.simulado_audit_logs add column if not exists sessao_id uuid;
alter table public.simulado_audit_logs add column if not exists status text;
create index if not exists idx_audit_logs_sessao on public.simulado_audit_logs (sessao_id) where sessao_id is not null;
create index if not exists idx_audit_logs_request on public.simulado_audit_logs (request_id) where request_id is not null;

-- Retenção: apaga registros mais antigos que `dias` (default 180, mínimo 30). Só toca nas tabelas deste rastreio.
create or replace function public.simulado_admin_rastreio_purgar(dias int default 180)
returns table (atividades bigint, sessoes bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  corte timestamptz := now() - make_interval(days => greatest(dias, 30));
  a bigint; b bigint;
begin
  delete from public.simulado_admin_atividades where criado_em < corte;
  get diagnostics a = row_count;
  delete from public.simulado_admin_sessoes where ultimo_visto_em < corte;
  get diagnostics b = row_count;
  return query select a, b;
end $$;

revoke all on function public.simulado_admin_rastreio_purgar(int) from public, anon, authenticated;

notify pgrst, 'reload schema';
