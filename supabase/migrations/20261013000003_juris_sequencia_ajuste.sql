-- Ajuste MANUAL da sequência (streak) do Desafio de Jurisprudência por aluno/desafio — espelha o do
-- Lei Seca (simulado_leitura_sequencia_ajuste). O suporte reconfigura pelo calendário no detalhe do
-- aluno (3 pontinhos do ranking). `overrides` = { "YYYY-MM-DD": true|false }: força o dia a CONTAR
-- (true) ou DESCONSIDERA (false) um dia que o aluno fez. Escopo por (tenant, aluno, desafio).
create table if not exists public.simulado_jurisprudencia_sequencia_ajuste (
  tenant_id      uuid not null,
  estudante_id   uuid not null,
  desafio_id     uuid not null,
  overrides      jsonb not null default '{}'::jsonb,
  atualizado_por uuid,
  atualizado_em  timestamptz not null default now(),
  primary key (tenant_id, estudante_id, desafio_id)
);
-- RLS ligado SEM políticas: nenhum cliente anon/auth lê; só o service role (ranking + server actions).
alter table public.simulado_jurisprudencia_sequencia_ajuste enable row level security;

notify pgrst, 'reload schema';
