-- REGISTRO DE ACESSOS DO ALUNO (segurança / investigação de "alguém acessou minha conta").
-- Hoje só existe simulado_estudantes.ultimo_acesso_em. Esta migração cria:
--   * simulado_aluno_acessos     — 1 linha por SESSÃO de acesso (IP, aparelho, método, origem, último visto).
--   * simulado_aluno_atividades  — eventos leves (leitura, grifo, quiz, simulado, jogo…).
--   * simulado_estudantes.sessoes_revogadas_em — "encerrar todas as sessões" (JWT com iat anterior é rejeitado).
--   * simulado_aluno_registro_purgar(dias) — retenção (default 180 dias), chamada por /api/cron/acessos-purge.
-- LGPD: IP/UA são dado pessoal → só admin com permissão `acessos:view` (service role no servidor). Nunca exposto ao aluno.
-- Sem FK que bloqueie apagar aluno: ON DELETE CASCADE no estudante. Idempotente. NÃO apaga/altera dados existentes.
-- Aplicar manualmente (SQL editor).

create table if not exists public.simulado_aluno_acessos (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  estudante_id uuid not null references public.simulado_estudantes(id) on delete cascade,
  metodo text not null default 'outro',           -- senha|email|email_cpf|email_telefone|otp|curseduca|impersonacao|outro
  ip text,
  user_agent text,
  navegador text,
  so text,
  dispositivo text,                               -- desktop|celular|tablet
  origem text not null default 'portal',          -- portal|embed|curseduca-iframe
  iniciado_em timestamptz not null default now(),
  ultimo_visto_em timestamptz not null default now(),
  encerrado_em timestamptz,
  motivo_encerramento text,                       -- logout|revogado_admin|expirado|outro
  sessao_ref text,                                -- hash do jti da sessão (NUNCA o token)
  impersonado_por uuid
);

create index if not exists idx_aluno_acessos_est on public.simulado_aluno_acessos (estudante_id, iniciado_em desc);
create index if not exists idx_aluno_acessos_tenant on public.simulado_aluno_acessos (tenant_id, iniciado_em desc);
create index if not exists idx_aluno_acessos_ip on public.simulado_aluno_acessos (tenant_id, ip, iniciado_em desc);
create index if not exists idx_aluno_acessos_ativos on public.simulado_aluno_acessos (tenant_id, ultimo_visto_em desc) where encerrado_em is null;
create unique index if not exists uq_aluno_acessos_ref on public.simulado_aluno_acessos (tenant_id, sessao_ref) where sessao_ref is not null;

create table if not exists public.simulado_aluno_atividades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  estudante_id uuid not null references public.simulado_estudantes(id) on delete cascade,
  acesso_id uuid references public.simulado_aluno_acessos(id) on delete set null,
  tipo text not null default 'outro',             -- leitura_aberta|leitura_concluida|grifo_criado|grifo_removido|nota_editada|quiz_tentativa|simulado_iniciado|simulado_finalizado|jogo_progresso|pagina_vista|outro
  ref_tipo text,
  ref_id text,
  titulo text,
  meta jsonb not null default '{}'::jsonb,
  ip text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_aluno_ativ_est on public.simulado_aluno_atividades (estudante_id, criado_em desc);
create index if not exists idx_aluno_ativ_tenant on public.simulado_aluno_atividades (tenant_id, criado_em desc);
create index if not exists idx_aluno_ativ_acesso on public.simulado_aluno_atividades (acesso_id);

alter table public.simulado_aluno_acessos enable row level security;
drop policy if exists tenant_isolation on public.simulado_aluno_acessos;
create policy tenant_isolation on public.simulado_aluno_acessos
  using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

alter table public.simulado_aluno_atividades enable row level security;
drop policy if exists tenant_isolation on public.simulado_aluno_atividades;
create policy tenant_isolation on public.simulado_aluno_atividades
  using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Revogação de sessões: tokens emitidos (iat) ANTES deste instante deixam de valer (checado com cache de 60 s).
alter table public.simulado_estudantes add column if not exists sessoes_revogadas_em timestamptz;

-- Retenção: apaga registros mais antigos que `dias` (default 180). Só toca nas tabelas deste registro.
create or replace function public.simulado_aluno_registro_purgar(dias int default 180)
returns table (atividades bigint, acessos bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  corte timestamptz := now() - make_interval(days => greatest(dias, 30));
  a bigint; b bigint;
begin
  delete from public.simulado_aluno_atividades where criado_em < corte;
  get diagnostics a = row_count;
  delete from public.simulado_aluno_acessos where ultimo_visto_em < corte;
  get diagnostics b = row_count;
  return query select a, b;
end $$;

revoke all on function public.simulado_aluno_registro_purgar(int) from public, anon, authenticated;

notify pgrst, 'reload schema';
