-- E1 (impersonation) — permissão de "visualizar como aluno" por PAPEL, adaptada ao multitenant real.
-- Brief seção 2 (impersonation_permissions) → renomeado p/ simulado_* + tenant_id + RLS; FK no
-- simulado_roles real. `scope` adaptado (não há turma/escola): own_tenant | all_tenants.
-- MVP = read_only (o serviço trava em read_only mesmo que a linha diga read_and_act).
-- Enquanto a tabela não existir, o leitor é tolerante e a feature fica DORMENTE.

create table if not exists simulado_impersonation_permissions (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  role_id       uuid not null references simulado_roles(id) on delete cascade,
  scope         varchar(30) not null default 'own_tenant'  check (scope in ('own_tenant','all_tenants')),
  action_level  varchar(20) not null default 'read_only'   check (action_level in ('read_only','read_and_act')),
  criado_em     timestamptz not null default now(),
  unique (tenant_id, role_id)
);

create index if not exists idx_impers_perms_tenant on simulado_impersonation_permissions (tenant_id);

alter table simulado_impersonation_permissions enable row level security;

-- RLS: isola por tenant (mesmo padrão das demais tabelas de negócio).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'simulado_impersonation_permissions' and policyname = 'impers_perms_tenant'
  ) then
    create policy impers_perms_tenant on simulado_impersonation_permissions
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- Seed inicial: concede a "visualização do aluno" aos papéis administrativos de sistema, em
-- own_tenant/read_only. super_admin é tratado no código (acesso cross-tenant), não precisa de linha.
insert into simulado_impersonation_permissions (tenant_id, role_id, scope, action_level)
select r.tenant_id, r.id, 'own_tenant', 'read_only'
from simulado_roles r
where r.nome in ('admin', 'admin_geral', 'admin_conteudo', 'admin_correcao', 'admin_relatorio', 'admin_comercial')
on conflict (tenant_id, role_id) do nothing;
