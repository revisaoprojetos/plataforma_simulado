-- PAINEL SNAPSHOT (Fase 0 do backend-first) — dado PRECOMPUTADO do "Meu painel de estudos" por aluno.
-- A página lê 1 linha pronta (zero cálculo no render). Mantido fresco por: write-behind (ações do aluno
-- atualizam) + roll no worker (cron). Ver docs/ARQUITETURA-BACKEND-FIRST.md.
-- `dia` = o dia (metas de hoje) a que o snapshot se refere; se dia != hoje, a leitura recomputa.
create table if not exists simulado_painel_snapshot (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  estudante_id  uuid not null,
  dia           date not null,
  dados         jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  unique (estudante_id)
);

create index if not exists idx_painel_snapshot_tenant on simulado_painel_snapshot (tenant_id, atualizado_em desc);

alter table simulado_painel_snapshot enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_painel_snapshot' and policyname='painel_snapshot_tenant') then
    create policy painel_snapshot_tenant on simulado_painel_snapshot
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

notify pgrst, 'reload schema';
