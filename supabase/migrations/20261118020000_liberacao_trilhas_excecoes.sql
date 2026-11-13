-- CONTROLE DE LIBERAÇÃO DO EXTENSIVO: cronogramas (trilhas), regras por condição, exceções manuais e log.
-- Depende de 20261117010000 (simulado_produto_liberacao_aulas = 1 linha por aula, com a data-base).
--
-- 1) simulado_liberacao_trilhas — um CRONOGRAMA de referência do produto (9 Matérias Essenciais, Extensivo 6 Dias,
--    12 Matérias, Pré-Edital AGU, Pós Formação de Base, Complementares…). `segmento_ids` = CONDIÇÃO (mesmos Segmentos
--    do produto: grupo/produto/e-mail…): o aluno que casa em QUALQUER um segue esta trilha. Quem casa em várias
--    (ex.: Passaporte Vitalício) recebe, por aula, a MENOR data entre elas. `offset_dias` = antecedência (padrão 28 = 4 semanas).
-- 2) simulado_liberacao_trilha_aulas — a data da aula NAQUELA trilha (`data_cronograma`, a "data original" da planilha
--    "Data em cada cronograma"); liberação = data_cronograma − offset_dias, salvo `data_manual` (override do admin).
-- 3) simulado_liberacao_excecoes — liberar/bloquear manualmente uma aula ou módulo para um aluno ou grupo
--    (com motivo e validade). Vence sobre trilha e planilha.
-- 4) simulado_liberacao_log — trilha de auditoria legível (manual e automática).
--
-- Aluno que não casa em nenhuma trilha segue a data-base da planilha (simulado_produto_liberacao_aulas.data_liberacao).
-- Leitura tolerante: sem as tabelas nada muda. Aplicar manualmente (SQL editor), DEPOIS de 20261117010000.

create table if not exists public.simulado_liberacao_trilhas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  produto_id    uuid not null references public.simulado_produtos(id) on delete cascade,
  nome          text not null check (char_length(nome) between 1 and 120),
  descricao     text,
  ordem         int not null default 0,
  inicio_cronograma date,                                   -- ex.: 2026-11-16 (informativo/recálculo)
  offset_dias   int not null default 28 check (offset_dias between 0 and 730),
  segmento_ids  uuid[] not null default '{}',               -- condição (Segmentos); vazio = ninguém casa automaticamente
  cor           text,
  ativo         boolean not null default true,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (produto_id, nome)
);
create index if not exists idx_lib_trilhas_produto on public.simulado_liberacao_trilhas (tenant_id, produto_id) where ativo = true;

create table if not exists public.simulado_liberacao_trilha_aulas (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  trilha_id       uuid not null references public.simulado_liberacao_trilhas(id) on delete cascade,
  liberacao_aula_id uuid not null references public.simulado_produto_liberacao_aulas(id) on delete cascade,
  data_cronograma date,                                     -- NULL = a aula não aparece nesta trilha
  data_manual     date,                                     -- override: libera EXATAMENTE nesta data (ignora offset)
  observacao      text,
  atualizado_por  uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (trilha_id, liberacao_aula_id)
);
create index if not exists idx_lib_trilha_aulas_aula on public.simulado_liberacao_trilha_aulas (liberacao_aula_id);

create table if not exists public.simulado_liberacao_excecoes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  produto_id    uuid not null references public.simulado_produtos(id) on delete cascade,
  alvo_tipo     text not null check (alvo_tipo in ('aula','modulo')),
  alvo_id       uuid not null,                              -- submódulo (aula) ou módulo do produto
  estudante_id  uuid,                                       -- exatamente um dos dois: aluno OU grupo
  grupo_id      uuid,
  acao          text not null check (acao in ('liberar','bloquear')),
  motivo        text,
  expira_em     timestamptz,                                -- NULL = sem validade
  ativo         boolean not null default true,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check ((estudante_id is not null) <> (grupo_id is not null))
);
create index if not exists idx_lib_exc_produto on public.simulado_liberacao_excecoes (tenant_id, produto_id) where ativo = true;
create index if not exists idx_lib_exc_estudante on public.simulado_liberacao_excecoes (estudante_id) where ativo = true;
create index if not exists idx_lib_exc_grupo on public.simulado_liberacao_excecoes (grupo_id) where ativo = true;
create index if not exists idx_lib_exc_alvo on public.simulado_liberacao_excecoes (alvo_id);

create table if not exists public.simulado_liberacao_log (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  produto_id    uuid,
  origem        text not null check (origem in ('manual','automatico','importacao')),
  acao          text not null,                              -- ex.: 'trilha_criada','data_alterada','excecao_criada','recalculo'
  alvo_tipo     text,
  alvo_id       uuid,
  estudante_id  uuid,
  detalhe       jsonb not null default '{}'::jsonb,
  feito_por     uuid,
  criado_em     timestamptz not null default now()
);
create index if not exists idx_lib_log_produto on public.simulado_liberacao_log (tenant_id, produto_id, criado_em desc);

do $$
declare t text;
begin
  foreach t in array array['simulado_liberacao_trilhas','simulado_liberacao_trilha_aulas','simulado_liberacao_excecoes','simulado_liberacao_log'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "tenant_isolation_%s" on public.%I', t, t);
    execute format('create policy "tenant_isolation_%s" on public.%I for all to authenticated
      using (tenant_id in (select public.user_tenant_ids()))
      with check (tenant_id in (select public.user_tenant_ids()))', t, t);
    execute format('grant all on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
