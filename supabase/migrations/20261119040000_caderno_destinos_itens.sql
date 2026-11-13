-- MEUS CADERNOS — destino padrão de salvamento (Leitura / Questões) + itens de grifo/anotação com posição.
--  1) simulado_aluno_caderno_destinos: por aluno e contexto ('leitura' | 'questoes'), qual caderno é o destino
--     padrão (caderno_id NULL = "perguntar sempre") e se salva SEM perguntar. O Caderno de Erros é CALCULADO
--     (lib/aluno/cadernos-aluno.ts) e NÃO entra aqui.
--  2) simulado_aluno_caderno_itens ganha: ref_tabela (origem do grifo_ref), pagina, rects (geometria do grifo no PDF)
--     e html (folha de anotações do leitor). O CHECK de tipo (comentario|grifo|anotacao) já existe e é mantido.
-- Acesso só via service role (rotas /api/aluno/cadernos/*); RLS padrão por tenant. IDEMPOTENTE.

create table if not exists simulado_aluno_caderno_destinos (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  estudante_id          uuid not null,
  contexto              text not null check (contexto in ('leitura','questoes')),
  caderno_id            uuid references simulado_aluno_cadernos (id) on delete set null,
  salvar_sem_perguntar  boolean not null default false,
  atualizado_em         timestamptz not null default now(),
  constraint uq_caderno_destino_aluno_contexto unique (estudante_id, contexto)
);

create index if not exists idx_caderno_destinos_tenant
  on simulado_aluno_caderno_destinos (tenant_id, estudante_id);

alter table simulado_aluno_caderno_destinos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'simulado_aluno_caderno_destinos' and policyname = 'caderno_destinos_tenant') then
    create policy caderno_destinos_tenant on simulado_aluno_caderno_destinos
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- Itens: posição do grifo (página + retângulos), origem do grifo_ref e folha de anotações (html).
alter table simulado_aluno_caderno_itens add column if not exists ref_tabela text;
alter table simulado_aluno_caderno_itens add column if not exists pagina     int;
alter table simulado_aluno_caderno_itens add column if not exists rects      jsonb;
alter table simulado_aluno_caderno_itens add column if not exists html       text;

-- Consulta "o que deste material já está salvo em cadernos" (GET item?documento_id=).
create index if not exists idx_caderno_itens_documento
  on simulado_aluno_caderno_itens (tenant_id, estudante_id, documento_id) where documento_id is not null;

notify pgrst, 'reload schema';
