-- Ajuste MANUAL da sequência (streak) de leitura por aluno/módulo — o suporte reconfigura pelo
-- calendário no detalhe do aluno. `overrides` = { "YYYY-MM-DD": true|false }: força um dia a CONTAR
-- (true) ou ser DESCONSIDERADO (false), sobrepondo o cálculo automático (dias em que o aluno concluiu
-- uma aula). Dias fora do mapa usam o valor automático. Escopo por (tenant, aluno, módulo).
create table if not exists public.simulado_leitura_sequencia_ajuste (
  tenant_id      uuid not null,
  estudante_id   uuid not null,
  modulo_id      text not null,             -- pasta (uuid em texto) ou '__geral__'
  overrides      jsonb not null default '{}'::jsonb,
  atualizado_por uuid,
  atualizado_em  timestamptz not null default now(),
  primary key (tenant_id, estudante_id, modulo_id)
);
-- RLS ligado SEM políticas: nenhum cliente anon/auth lê; só o service role (ranking + server actions).
alter table public.simulado_leitura_sequencia_ajuste enable row level security;
