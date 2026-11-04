-- SEGMENTOS DE VISIBILIDADE (estilo "Criar um Segmento" do ActiveCampaign) + REGRAS por produto.
--
-- 1) simulado_segmentos — um público de alunos definido por CONDIÇÕES (jsonb `regra`):
--      { "op": "e"|"ou", "grupos": [ { "id", "op": "e"|"ou", "condicoes": [ { "id", "campo", "operador",
--        "valor", "valor2", "ref", "dias" } ] } ] }
--    Campos: dados do aluno (nome, e-mail, cadastro…), grupos (está / entrada / validade), assinatura
--    de produto, atividade (simulados, nota, questões, % de acerto, leitura, tempo de estudo) e data atual.
--    Reutilizável entre produtos do tenant. Avaliado no servidor, por aluno (lib/segmentos/avaliar.ts).
--
-- 2) simulado_produto_visibilidade — onde o segmento se APLICA dentro de um produto:
--      alvo 'produto' + efeito 'liberar'  → alunos do segmento ganham acesso ao produto;
--      alvo 'produto' + efeito 'bloquear' → alunos do segmento NÃO acessam (mesmo com assinatura/grupo);
--      alvo 'modulo'|'aula' + efeito 'mostrar' → só alunos do segmento veem (os demais: oculto/cadeado);
--      alvo 'modulo'|'aula' + efeito 'ocultar' → alunos do segmento não veem.
--
-- Leitura tolerante no código: sem estas tabelas, nada muda para o aluno e a aba mostra o aviso da migração.
-- Aplicar manualmente (SQL editor) — inclui NOTIFY pgrst.

create table if not exists public.simulado_segmentos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  nome          text not null check (char_length(nome) between 1 and 250),
  descricao     text check (descricao is null or char_length(descricao) <= 1000),
  regra         jsonb not null default '{"op":"e","grupos":[]}'::jsonb,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  deletado      boolean not null default false,
  deletado_em   timestamptz
);
create index if not exists idx_segmentos_tenant on public.simulado_segmentos (tenant_id) where deletado = false;

create table if not exists public.simulado_produto_visibilidade (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  produto_id    uuid not null references public.simulado_produtos(id) on delete cascade,
  segmento_id   uuid not null references public.simulado_segmentos(id) on delete cascade,
  alvo_tipo     text not null check (alvo_tipo in ('produto','modulo','aula')),
  alvo_id       uuid,  -- id do módulo/aula; NULL quando alvo_tipo = 'produto'
  efeito        text not null check (efeito in ('liberar','bloquear','mostrar','ocultar')),
  sem_acesso    text not null default 'oculto' check (sem_acesso in ('oculto','bloqueado_cadeado')),
  ativo         boolean not null default true,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check ((alvo_tipo = 'produto') = (alvo_id is null)),
  check ((alvo_tipo = 'produto' and efeito in ('liberar','bloquear')) or (alvo_tipo <> 'produto' and efeito in ('mostrar','ocultar')))
);
create index if not exists idx_produto_visib_produto on public.simulado_produto_visibilidade (tenant_id, produto_id) where ativo = true;
create index if not exists idx_produto_visib_segmento on public.simulado_produto_visibilidade (segmento_id);
create index if not exists idx_produto_visib_acesso on public.simulado_produto_visibilidade (tenant_id) where ativo = true and alvo_tipo = 'produto';

-- RLS por tenant (mesmo padrão das regras de liberação). O app usa service role.
do $$
declare t text;
begin
  foreach t in array array['simulado_segmentos','simulado_produto_visibilidade'] loop
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
