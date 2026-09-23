-- E5 (impersonation) — log append-only das sessões de visualização (brief seção 2/7.5).
-- Adaptado: tenant_id + RLS; student = simulado_estudantes; admin = auth user (uuid).
-- Imutabilidade FÍSICA via trigger (não confia só na role): DELETE proibido; UPDATE só para
-- ENCERRAR a sessão UMA vez (setar ended_at/end_reason / anexar actions_performed).
create table if not exists simulado_impersonation_logs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  admin_id           uuid not null,
  estudante_id       uuid not null,
  scope_used         varchar(30) not null,
  action_level_used  varchar(20) not null,
  ip_address         text,
  started_at         timestamptz not null default now(),
  ended_at           timestamptz,
  end_reason         varchar(30) check (end_reason in ('closed_by_admin','expired','renewed_into_new_session')),
  actions_performed  jsonb not null default '[]'::jsonb
);

create index if not exists idx_impers_logs_admin   on simulado_impersonation_logs (admin_id, started_at desc);
create index if not exists idx_impers_logs_student on simulado_impersonation_logs (estudante_id, started_at desc);
create index if not exists idx_impers_logs_tenant  on simulado_impersonation_logs (tenant_id, started_at desc);

alter table simulado_impersonation_logs enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_impersonation_logs' and policyname='impers_logs_tenant') then
    create policy impers_logs_tenant on simulado_impersonation_logs
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- Trigger de imutabilidade (append-only): bloqueia DELETE e restringe UPDATE ao encerramento único.
create or replace function simulado_impersonation_logs_imutavel() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'simulado_impersonation_logs é append-only: DELETE proibido';
  end if;
  -- UPDATE: só quando ainda estava aberta (ended_at null); campos de identidade não mudam.
  if old.ended_at is not null then
    raise exception 'sessão de impersonation já encerrada — registro imutável';
  end if;
  if new.id <> old.id or new.tenant_id <> old.tenant_id or new.admin_id <> old.admin_id
     or new.estudante_id <> old.estudante_id or new.started_at <> old.started_at
     or new.scope_used <> old.scope_used or new.action_level_used <> old.action_level_used then
    raise exception 'campos imutáveis de simulado_impersonation_logs não podem ser alterados';
  end if;
  return new;
end $$;

drop trigger if exists trg_impers_logs_imutavel on simulado_impersonation_logs;
create trigger trg_impers_logs_imutavel
  before update or delete on simulado_impersonation_logs
  for each row execute function simulado_impersonation_logs_imutavel();
