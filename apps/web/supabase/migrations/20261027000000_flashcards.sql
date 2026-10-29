-- FLASHCARDS (eixo b) — cartões de revisão por MATERIAL, criados pelo ADMIN, com progresso SRS por aluno.
-- Decisões do produto: origem = admin cria por material; progresso = SRS (Leitner) por aluno.
-- Duas tabelas:
--   simulado_flashcards            → o cartão (frente/verso) vinculado a um documento da Biblioteca.
--   simulado_flashcard_revisoes    → estado de revisão de CADA aluno em CADA cartão (caixa Leitner + agenda).
-- RLS por tenant igual ao restante (ver 20261013000000_leitura_rapida_progresso.sql).

-- ─────────────────────────── 1) Cartões (autoria do admin) ───────────────────────────
create table if not exists simulado_flashcards (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  documento_id  uuid not null,                       -- material da Biblioteca (simulado_conteudo_documentos.id)
  frente        text not null,                       -- pergunta / estímulo
  verso         text not null,                       -- resposta
  ordem         int  not null default 0,             -- ordem de exibição dentro do material
  ativo         boolean not null default true,       -- desativar sem apagar (preserva revisões)
  criado_por    uuid,                                -- user admin autor (nullable p/ importação)
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_flashcards_doc   on simulado_flashcards (tenant_id, documento_id, ordem);
create index if not exists idx_flashcards_ativo on simulado_flashcards (tenant_id, documento_id) where ativo;

alter table simulado_flashcards enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_flashcards' and policyname='flashcards_tenant') then
    create policy flashcards_tenant on simulado_flashcards
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- ─────────────────────────── 2) Revisões (progresso SRS por aluno) ───────────────────────────
-- caixa = nível Leitner (0..5). Intervalos (dias) por caixa: 0→hoje, 1→1, 2→3, 3→7, 4→16, 5→30.
-- Acertou: caixa = min(caixa+1, 5). Errou: caixa = 0. proxima_revisao = now() + intervalo(caixa).
create table if not exists simulado_flashcard_revisoes (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  estudante_id   uuid not null,
  flashcard_id   uuid not null references simulado_flashcards(id) on delete cascade,
  caixa          int  not null default 0,            -- nível Leitner
  acertos        int  not null default 0,
  erros          int  not null default 0,
  ultimo_resultado text,                             -- 'facil' | 'bom' | 'dificil' | 'errou'
  ultima_revisao timestamptz,
  proxima_revisao timestamptz,                        -- quando volta à fila ("devida" se <= now())
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  unique (estudante_id, flashcard_id)
);

create index if not exists idx_flashcard_rev_aluno    on simulado_flashcard_revisoes (tenant_id, estudante_id);
create index if not exists idx_flashcard_rev_devidas  on simulado_flashcard_revisoes (estudante_id, proxima_revisao);
create index if not exists idx_flashcard_rev_card     on simulado_flashcard_revisoes (flashcard_id);

alter table simulado_flashcard_revisoes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_flashcard_revisoes' and policyname='flashcard_rev_tenant') then
    create policy flashcard_rev_tenant on simulado_flashcard_revisoes
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- PostgREST: recarregar o schema cache para as tabelas novas ficarem visíveis de imediato.
notify pgrst, 'reload schema';
