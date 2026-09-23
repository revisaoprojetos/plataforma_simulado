-- E7 (impersonation) — modo de notificação por tenant (brief seção 2/7.2).
-- mandatory_notification: avisa o aluno (in-app) a cada visualização.
-- passive_history: só registra no log (default).
-- disabled: bloqueia a visualização do aluno nesse tenant.
create table if not exists simulado_impersonation_notification_config (
  tenant_id      uuid primary key,
  mode           varchar(30) not null default 'passive_history'
                 check (mode in ('mandatory_notification','passive_history','disabled')),
  atualizado_em  timestamptz not null default now()
);

alter table simulado_impersonation_notification_config enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_impersonation_notification_config' and policyname='impers_notif_tenant') then
    create policy impers_notif_tenant on simulado_impersonation_notification_config
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;
