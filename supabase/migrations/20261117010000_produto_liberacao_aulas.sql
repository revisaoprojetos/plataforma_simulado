-- LIBERAÇÃO DE AULAS DO EXTENSIVO (planilha "primeira aparição" + cronograma do aluno).
--
-- 1) simulado_produto_liberacao_aulas — uma linha por aula do extensivo com a DATA em que ela abre para o aluno
--    SEM cronograma fixado (= primeira aparição da aula em algum cronograma − 4 semanas). Casa com o submódulo
--    (aula) do produto por `aula_id` (preenchido na importação; NULL = não casou, aparece como pendência no admin).
-- 2) simulado_produto_liberacao_cfg — configuração por produto: liga/desliga o gate e define o que vale para o
--    aluno COM cronograma fixado (ver `com_plano`).
--
-- Aluno COM cronograma fixado:
--   'concluir_meta' (padrão) — a aula só libera quando ele conclui a meta correspondente no plano;
--   'plano'                  — libera quando a meta entra no plano dele (data da meta − dias_antes);
--   'mais_cedo'              — o que ocorrer primeiro entre a data da planilha e o plano.
-- Aluno SEM cronograma: 'planilha' (data da planilha), 'liberado' (tudo aberto) ou 'atual' (disponibilidade atual do item).
--
-- Leitura tolerante: sem as tabelas, ou sem cfg ativa, nada muda para o aluno. Aplicar manualmente (SQL editor).

create table if not exists public.simulado_produto_liberacao_cfg (
  produto_id    uuid primary key references public.simulado_produtos(id) on delete cascade,
  tenant_id     uuid not null,
  ativo         boolean not null default false,
  sem_plano     text not null default 'planilha' check (sem_plano in ('planilha','liberado','atual')),
  com_plano     text not null default 'concluir_meta' check (com_plano in ('concluir_meta','plano','mais_cedo')),
  dias_antes    int not null default 0 check (dias_antes between 0 and 365),
  atualizado_por uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.simulado_produto_liberacao_aulas (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  produto_id      uuid not null references public.simulado_produtos(id) on delete cascade,
  ordem           int not null,                       -- nº da linha na planilha (Nº)
  modulo_id       uuid references public.simulado_produto_modulos(id) on delete set null, -- disciplina (módulo raiz)
  aula_id         uuid references public.simulado_produto_modulos(id) on delete set null, -- aula (submódulo); NULL = sem casamento
  disciplina      text not null,                      -- "Matéria" da planilha
  numero_aula     int,                                -- "Nº da aula" (NULL em Legislação da AGU)
  titulo          text not null,
  data_liberacao  date not null,
  cronogramas     text,                               -- "Cronograma onde aparece primeiro"
  semana          int,
  observacao      text,
  data_original   date,                               -- data da primeira aparição no cronograma
  ativo           boolean not null default true,
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  unique (produto_id, ordem)
);
create index if not exists idx_prod_lib_aulas_produto on public.simulado_produto_liberacao_aulas (tenant_id, produto_id) where ativo = true;
create index if not exists idx_prod_lib_aulas_aula on public.simulado_produto_liberacao_aulas (aula_id);
create index if not exists idx_prod_lib_aulas_data on public.simulado_produto_liberacao_aulas (produto_id, data_liberacao);

do $$
declare t text;
begin
  foreach t in array array['simulado_produto_liberacao_cfg','simulado_produto_liberacao_aulas'] loop
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
