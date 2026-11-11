-- Plataforma Revisão · Dashboard (admin): calendário do Revisão + atualizações em massa.
-- Aditiva e idempotente. NÃO aplicada automaticamente (aplicar manualmente no SQL Editor).
-- Usada por: /admin/revisao/inicio (leitura). O CRUD do calendário é da tela "Calendário de eventos"
-- (mesma tabela); a Central de Atualizações grava em simulado_atualizacoes_massa.

-- (Calendário: usa simulado_eventos_calendario, criada na migration do bloco CS.)

-- ── Atualizações em massa dos materiais (lei nova, julgado novo, correção) ─────────────────────────
create table if not exists public.simulado_atualizacoes_massa (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  data            date not null,
  titulo          text not null,                                 -- "EC 136 incluída"
  descricao       text,                                          -- "LegProc da CF e PDFulls de Constitucional"
  tipo            text not null default 'Legislação'
                  check (tipo in ('Legislação','Jurisprudência','Correção')),
  materiais       integer not null default 0,                    -- nº de materiais alterados
  alunos_avisados integer not null default 0,
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  deletado        boolean not null default false
);
create index if not exists idx_atualiz_massa_tenant_data
  on public.simulado_atualizacoes_massa (tenant_id, data desc) where deletado = false;

-- ── RLS por tenant (o app usa service role, que bypassa; protege o caminho autenticado) ────────────
do $$
declare t text;
begin
  foreach t in array array['simulado_atualizacoes_massa'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('drop policy if exists %I_isolation on public.%I;', t, t);
    execute format($p$create policy %I_isolation on public.%I
      using (tenant_id in (select tenant_id from public.simulado_tenant_acessos where user_id = auth.uid() and ativo = true))
      with check (tenant_id in (select tenant_id from public.simulado_tenant_acessos where user_id = auth.uid() and ativo = true));$p$, t, t);
  end loop;
end $$;

notify pgrst, 'reload schema';
