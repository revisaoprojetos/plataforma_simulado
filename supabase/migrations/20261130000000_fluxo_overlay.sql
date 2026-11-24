-- CONSTRUTOR DE FLUXO (overlay do usuário sobre o grafo base): nós/arestas/diagramas próprios + regras executáveis do Cronograma Adaptativo.
-- Aditiva e idempotente. APLICAR MANUALMENTE. O código funciona SEM esta migração (tabela ausente = só o grafo base; construtor desabilitado).
-- Padrão de versão otimista/histórico idêntico a `tema.cronograma_adaptativo_regras`, mas em tabela própria (sem regravar o `tema` inteiro).
-- Só service role: RLS ligado, sem policies, sem grants p/ anon/authenticated.

create table if not exists public.simulado_fluxo_overlays (
  tenant_id     uuid not null,  -- sem FK (padrão das migrações recentes)
  adaptador     text not null,                              -- 'cronograma-adaptativo' | 'cronograma-gerador' | …
  versao        integer not null default 1,                 -- checagem otimista ao salvar
  overlay       jsonb not null default '{}'::jsonb,
  hash          text not null default '',
  motivo        text,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid,
  primary key (tenant_id, adaptador)
);

create table if not exists public.simulado_fluxo_overlay_versoes (
  id          bigserial primary key,
  tenant_id   uuid not null,  -- sem FK (padrão das migrações recentes)
  adaptador   text not null,
  versao      integer not null,
  overlay     jsonb not null,
  hash        text not null default '',
  motivo      text,
  criado_em   timestamptz not null default now(),
  criado_por  uuid,
  unique (tenant_id, adaptador, versao)
);
create index if not exists idx_fluxo_overlay_versoes on public.simulado_fluxo_overlay_versoes (tenant_id, adaptador, versao desc);

alter table public.simulado_fluxo_overlays enable row level security;
alter table public.simulado_fluxo_overlay_versoes enable row level security;
revoke all on public.simulado_fluxo_overlays from anon, authenticated;
revoke all on public.simulado_fluxo_overlay_versoes from anon, authenticated;
