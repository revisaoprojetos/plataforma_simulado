-- MEUS CADERNOS (aluno) — itens de caderno que NÃO são questão: hoje 'comentario' (comentário do aluno sobre um
-- trecho do material, com a citação). Extensível: 'grifo' / 'anotacao' no futuro (basta ampliar o check).
-- As questões continuam em simulado_aluno_caderno_questoes (sem mudança). Backend-first: a página lê itens prontos.
-- IDEMPOTENTE: re-rodar é seguro.

create table if not exists simulado_aluno_caderno_itens (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  caderno_id       uuid not null references simulado_aluno_cadernos (id) on delete cascade,
  estudante_id     uuid not null,
  tipo             text not null default 'comentario' check (tipo in ('comentario','grifo','anotacao')),
  -- SNAPSHOT do material (sobrevive a renomeação/nova versão do documento)
  documento_id     uuid,
  documento_versao int,
  titulo_documento text,
  -- trecho (text-quote) + posição, quando conhecidos
  trecho           text,
  prefix           text,
  suffix           text,
  inicio           int,
  fim              int,
  comentario       text,
  cor              text,
  -- id do grifo no servidor (simulado_leitura_anotacoes) — dedupe por caderno
  grifo_ref        text,
  criado_em        timestamptz not null default now()
);

create index if not exists idx_caderno_itens_caderno
  on simulado_aluno_caderno_itens (caderno_id, criado_em desc);
create index if not exists idx_caderno_itens_aluno
  on simulado_aluno_caderno_itens (tenant_id, estudante_id);
create unique index if not exists uq_caderno_item_grifo_ref
  on simulado_aluno_caderno_itens (caderno_id, grifo_ref) where grifo_ref is not null;

alter table simulado_aluno_caderno_itens enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'simulado_aluno_caderno_itens' and policyname = 'caderno_itens_tenant') then
    create policy caderno_itens_tenant on simulado_aluno_caderno_itens
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

notify pgrst, 'reload schema';
