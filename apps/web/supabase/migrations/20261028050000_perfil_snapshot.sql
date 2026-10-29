-- PERFIL SNAPSHOT (backend-first) — dado PRECOMPUTADO do "Perfil e conquistas" por aluno.
-- A página lê 1 linha pronta (zero cálculo pesado no render: relatório do estudante + gamificação +
-- perfil-analytics). Mantido fresco por: write-behind (ações do aluno atualizam) + roll no worker
-- (cron perfil-roll). Ver docs/ARQUITETURA-BACKEND-FIRST.md.
-- `dia` = o dia a que o snapshot se refere (semana/mês/streak dependem da data); se dia != hoje, a leitura recomputa.
create table if not exists simulado_perfil_snapshot (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  estudante_id  uuid not null,
  dia           date not null,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  unique (estudante_id)
);

create index if not exists idx_perfil_snapshot_tenant on simulado_perfil_snapshot (tenant_id, atualizado_em desc);

alter table simulado_perfil_snapshot enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_perfil_snapshot' and policyname='perfil_snapshot_tenant') then
    create policy perfil_snapshot_tenant on simulado_perfil_snapshot
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

notify pgrst, 'reload schema';
