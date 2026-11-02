-- FLASHCARDS › BARALHOS (decks nomeados) — Estúdio de Conteúdo, área top-level.
-- Hoje o flashcard é POR MATERIAL (simulado_flashcards.documento_id). Esta migração adiciona o
-- conceito de "baralho/deck" NOMEADO (publicável, com alcance todos/grupos) e liga os cartões a ele.
-- REUSA o backend existente (lib/flashcards/*, simulado_flashcards/_flashcard_revisoes + SRS Leitner):
-- um cartão passa a poder pertencer a um BARALHO (baralho_id) OU a um material (documento_id).
-- RLS por tenant igual ao restante (ver 20261027000000_flashcards.sql).
--
-- NÃO aplicar automaticamente. Aplicar manualmente e rodar: NOTIFY pgrst, 'reload schema';

-- ─────────────────────────── 1) Baralhos (decks nomeados) ───────────────────────────
create table if not exists simulado_flashcard_baralhos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  nome          text not null,
  descricao     text,
  status        text not null default 'rascunho',   -- rascunho | publicado
  alcance       text not null default 'todos',       -- todos | grupos
  published_at  timestamptz,                          -- quando foi publicado (null = nunca)
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  -- Soft delete (Lixeira): o L0 deve incluir 'simulado_flashcard_baralhos' em SOFT_DELETE_TABELAS.
  deletado      boolean not null default false,
  deletado_em   timestamptz,
  deletado_por  uuid
);

create index if not exists idx_fc_baralhos_tenant on simulado_flashcard_baralhos (tenant_id, deletado, status);

alter table simulado_flashcard_baralhos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_flashcard_baralhos' and policyname='fc_baralhos_tenant') then
    create policy fc_baralhos_tenant on simulado_flashcard_baralhos
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- ─────────────────────────── 2) Alcance por grupos (quando alcance='grupos') ───────────────────────────
create table if not exists simulado_flashcard_baralho_grupos (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  baralho_id uuid not null references simulado_flashcard_baralhos(id) on delete cascade,
  grupo_id   uuid not null,
  criado_em  timestamptz not null default now(),
  unique (baralho_id, grupo_id)
);

create index if not exists idx_fc_baralho_grupos on simulado_flashcard_baralho_grupos (tenant_id, baralho_id);

alter table simulado_flashcard_baralho_grupos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_flashcard_baralho_grupos' and policyname='fc_baralho_grupos_tenant') then
    create policy fc_baralho_grupos_tenant on simulado_flashcard_baralho_grupos
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- ─────────────────────────── 3) Ligar cartões a um baralho (tolerante) ───────────────────────────
-- Um cartão agora pode pertencer a um BARALHO (baralho_id) ou a um MATERIAL (documento_id).
-- Por isso documento_id deixa de ser obrigatório. fonte/disciplina ficam no cartão (aparecem no verso,
-- conforme a tela do baralho e o CSV de importação: frente, verso, fonte, disciplina).
alter table simulado_flashcards add column if not exists baralho_id uuid references simulado_flashcard_baralhos(id) on delete cascade;
alter table simulado_flashcards add column if not exists fonte text;
alter table simulado_flashcards add column if not exists disciplina text;
alter table simulado_flashcards alter column documento_id drop not null;

create index if not exists idx_flashcards_baralho on simulado_flashcards (tenant_id, baralho_id, ordem);

-- PostgREST: recarregar o schema cache para as colunas/tabelas novas ficarem visíveis.
notify pgrst, 'reload schema';
