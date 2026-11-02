-- ============================================================================
-- Tags (etiquetas) de DOCUMENTOS da Biblioteca — N:N NOVA (Estúdio de Conteúdo · bloco Biblioteca)
--
-- Admin-only: o ALUNO NÃO vê. Servem para filtrar a lista de materiais/aulas e montar
-- listas de revisão da equipe (Tags.png: "As tags servem para filtrar a lista de Aulas…").
-- Espelha simulado_etiquetas (tags de questões): nome + cor, por tenant. O vínculo é N:N
-- entre as etiquetas e simulado_conteudo_documentos.
--
-- Convenções do repo (ver 20261019000000_conteudo_biblioteca_fase0.sql):
--   tabelas public.simulado_conteudo_*, tenant_id em TUDO, RLS LIGADO SEM políticas
--   (só o service role lê/escreve; a app filtra tenant_id). Aditivo/isolado — NÃO toca
--   em nada que já roda.
--
-- Idempotente: create table if not exists + create index if not exists + grants (repetíveis).
-- Estas tabelas NÃO são soft-deletáveis (sem colunas deletado*): a exclusão de uma etiqueta é
-- um DELETE real e o ON DELETE CASCADE desfaz os vínculos. Portanto NÃO precisam entrar em
-- SOFT_DELETE_TABELAS / Lixeira.
--
-- NÃO aplicar automaticamente. Aplicar manualmente e, ao final, rodar:
--   NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- Etiqueta (tag) de conteúdo — entidade por tenant.
create table if not exists public.simulado_conteudo_etiquetas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  nome          text not null,
  cor           text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- nome único por tenant (case-insensitive) → dedupe no "digite e aperte Enter".
create unique index if not exists uq_conteudo_etiqueta_nome
  on public.simulado_conteudo_etiquetas (tenant_id, lower(nome));
create index if not exists idx_conteudo_etiqueta_tenant
  on public.simulado_conteudo_etiquetas (tenant_id);

-- Join N:N documento ↔ etiqueta.
create table if not exists public.simulado_conteudo_documento_etiquetas (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  documento_id uuid not null references public.simulado_conteudo_documentos(id) on delete cascade,
  etiqueta_id  uuid not null references public.simulado_conteudo_etiquetas(id)  on delete cascade,
  criado_em    timestamptz not null default now(),
  unique (documento_id, etiqueta_id)
);
create index if not exists idx_conteudo_doc_etiq_doc
  on public.simulado_conteudo_documento_etiquetas (documento_id);
create index if not exists idx_conteudo_doc_etiq_etiq
  on public.simulado_conteudo_documento_etiquetas (etiqueta_id);
create index if not exists idx_conteudo_doc_etiq_tenant
  on public.simulado_conteudo_documento_etiquetas (tenant_id);

-- RLS ligado sem políticas (padrão do módulo: service role + filtro de tenant na app).
alter table public.simulado_conteudo_etiquetas           enable row level security;
alter table public.simulado_conteudo_documento_etiquetas enable row level security;

grant select, insert, update, delete on public.simulado_conteudo_etiquetas           to authenticated;
grant all                            on public.simulado_conteudo_etiquetas           to service_role;
grant select, insert, update, delete on public.simulado_conteudo_documento_etiquetas to authenticated;
grant all                            on public.simulado_conteudo_documento_etiquetas to service_role;

notify pgrst, 'reload schema';
