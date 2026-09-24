-- Carimbos (adesivos colecionáveis) por MÓDULO de Leitura. Paralelo às conquistas: o aluno ganha
-- carimbos ao cumprir condições no módulo; aparecem no perfil dele (igual conquistas) e como
-- "carimbo" no nó da trilha (posição/rotação configuráveis).
-- Definição por módulo (jsonb, sem DDL rígido) — código tolerante à ausência.
alter table simulado_pastas add column if not exists carimbos_def jsonb;

-- Ganhos por (módulo, aluno, carimbo). Append-only na prática (award idempotente).
create table if not exists simulado_leitura_carimbos (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  modulo_id    uuid not null,
  estudante_id uuid not null,
  carimbo_id   text not null,
  ganho_em     timestamptz not null default now(),
  unique (tenant_id, modulo_id, estudante_id, carimbo_id)
);

create index if not exists idx_leitura_carimbos_aluno on simulado_leitura_carimbos (estudante_id);
create index if not exists idx_leitura_carimbos_modulo on simulado_leitura_carimbos (tenant_id, modulo_id);

alter table simulado_leitura_carimbos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_leitura_carimbos' and policyname='leitura_carimbos_tenant') then
    create policy leitura_carimbos_tenant on simulado_leitura_carimbos
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;
