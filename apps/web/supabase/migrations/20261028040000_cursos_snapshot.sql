-- CURSOS SNAPSHOT (backend-first) — catálogo "Meus cursos" PRECOMPUTADO por aluno.
-- A página /nova/cursos passa a ler 1 linha pronta (zero cálculo no render); hoje ela chamava
-- carregarCatalogoCursos → arvoreBibliotecaAluno, que carrega a ÁRVORE INTEIRA da Biblioteca
-- (pastas + docs + thumbs/prévias) a cada render = lento + egress. Mantido fresco por: write-behind
-- (ações do aluno atualizam) + roll no worker (cron cursos-roll, recomputa os mais antigos).
-- Diferente do Painel, NÃO tem coluna `dia`: o catálogo não "vira" por data — a frescura é por tempo
-- (atualizado_em) + write-behind + roll. Ver docs/ARQUITETURA-BACKEND-FIRST.md.
create table if not exists simulado_cursos_snapshot (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  estudante_id  uuid not null,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  unique (estudante_id)
);

create index if not exists idx_cursos_snapshot_tenant on simulado_cursos_snapshot (tenant_id, atualizado_em desc);

alter table simulado_cursos_snapshot enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_cursos_snapshot' and policyname='cursos_snapshot_tenant') then
    create policy cursos_snapshot_tenant on simulado_cursos_snapshot
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

notify pgrst, 'reload schema';
