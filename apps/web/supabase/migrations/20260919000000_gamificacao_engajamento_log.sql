-- Log de idempotência dos envios de ENGAJAMENTO (webhook por sequência/inatividade/marco).
-- Garante que cada gatilho seja enviado UMA vez por (aluno, tipo, ref):
--   ref = marco-<streak> | seq-<streak> | inativo-<ultimo_dia_ativo>
-- A config dos gatilhos vive em simulado_gamificacao_config.xp_regras.engajamento (sem DDL).
-- Enquanto esta tabela não existir, o disparo fica DORMENTE (código tolerante — não envia).

create table if not exists simulado_gamificacao_engajamento_log (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  estudante_id uuid not null,
  tipo         text not null,          -- inativo | sequencia | marco
  ref          text not null,          -- chave do evento (evita reenvio)
  enviado_em   timestamptz not null default now(),
  unique (tenant_id, estudante_id, tipo, ref)
);

create index if not exists idx_gam_engaj_log_tenant on simulado_gamificacao_engajamento_log (tenant_id, enviado_em desc);

alter table simulado_gamificacao_engajamento_log enable row level security;

-- RLS: isola por tenant (mesmo padrão das demais tabelas de negócio).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'simulado_gamificacao_engajamento_log' and policyname = 'engaj_log_tenant'
  ) then
    create policy engaj_log_tenant on simulado_gamificacao_engajamento_log
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;
