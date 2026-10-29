-- DESEMPENHO SNAPSHOT (backend-first) — dado PRECOMPUTADO do "Meu desempenho" por aluno.
-- A página lê 1 linha pronta (zero cálculo pesado no render). Mantido fresco por: write-behind (ações
-- do aluno que mexem no desempenho atualizam) + roll no worker (cron). Ver docs/ARQUITETURA-BACKEND-FIRST.md.
-- `dia` = o dia (BRT) a que o snapshot se refere (a "constância" dos últimos 35 dias depende da data);
-- se dia != hoje, a leitura recomputa.
create table if not exists simulado_desempenho_snapshot (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  estudante_id  uuid not null,
  dia           date not null,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  unique (estudante_id)
);

create index if not exists idx_desempenho_snapshot_tenant on simulado_desempenho_snapshot (tenant_id, atualizado_em desc);

alter table simulado_desempenho_snapshot enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_desempenho_snapshot' and policyname='desempenho_snapshot_tenant') then
    create policy desempenho_snapshot_tenant on simulado_desempenho_snapshot
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

notify pgrst, 'reload schema';
