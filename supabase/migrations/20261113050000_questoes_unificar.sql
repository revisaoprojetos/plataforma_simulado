-- BIBLIOTECA > QUESTOES > UNIFICAR > QUESTOES DUPLICADAS.
-- Duas tabelas pequenas (a tela funciona SEM elas: "Nao e duplicada" cai para localStorage e o "Desfazer" so vale na sessao):
--  1) simulado_questoes_nao_duplicadas: pares que o admin marcou "Nao e duplicada" (a<b) -> a deteccao deixa de ligar o par.
--  2) simulado_questoes_unificacoes: relacao mestre <-> duplicadas + snapshot do estado anterior (permite DESFAZER depois e historico).
-- Nada e apagado das questoes; a unificacao so arquiva. Idempotente. NAO aplicado automaticamente.

create table if not exists public.simulado_questoes_nao_duplicadas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  questao_a uuid not null references public.simulado_questoes(id) on delete cascade,
  questao_b uuid not null references public.simulado_questoes(id) on delete cascade,
  criado_por uuid,
  criado_em timestamptz not null default now(),
  constraint chk_nao_dup_ordem check (questao_a < questao_b),
  constraint uq_nao_dup_par unique (tenant_id, questao_a, questao_b)
);
create index if not exists idx_nao_dup_tenant on public.simulado_questoes_nao_duplicadas (tenant_id);

create table if not exists public.simulado_questoes_unificacoes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  mestre_id uuid not null references public.simulado_questoes(id) on delete cascade,
  duplicadas uuid[] not null default '{}',
  modo text not null check (modo in ('completa', 'arquivar')),
  snapshot jsonb not null default '{}'::jsonb,   -- estado anterior (para desfazer)
  resumo jsonb not null default '{}'::jsonb,     -- o que foi feito (contagens)
  executado_por uuid,
  executado_em timestamptz not null default now(),
  desfeito_em timestamptz,
  desfeito_por uuid
);
create index if not exists idx_unif_q_tenant on public.simulado_questoes_unificacoes (tenant_id, executado_em desc);
create index if not exists idx_unif_q_mestre on public.simulado_questoes_unificacoes (mestre_id);
-- consulta "esta questao e duplicada de quem?" (GIN no array)
create index if not exists idx_unif_q_dups on public.simulado_questoes_unificacoes using gin (duplicadas);

do $$
declare t text;
begin
  foreach t in array array['simulado_questoes_nao_duplicadas', 'simulado_questoes_unificacoes'] loop
    execute format('alter table public.%I enable row level security;', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || '_tenant') then
      execute format($p$create policy %I on public.%I
        using (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        with check (tenant_id = current_setting('app.current_tenant_id', true)::uuid);$p$, t || '_tenant', t);
    end if;
  end loop;
end $$;

notify pgrst, 'reload schema';
