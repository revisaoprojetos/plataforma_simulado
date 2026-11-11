-- CENTRAL DE ATUALIZAÇÕES (Plataforma Revisão › Pedagógico). ADITIVA e IDEMPOTENTE.
-- NÃO aplicar automaticamente: revisar e rodar no SQL Editor, depois: NOTIFY pgrst, 'reload schema';
--
--   simulado_conteudo_atualizacoes          registro de cada atualização de um material (documento da Biblioteca).
--                                           Vira o selo "Atualizado em" + "Novidades da versão" no topo do PDF do aluno.
--   simulado_conteudo_atualizacao_pedidos   pedidos de atualização ("Para atualizar") feitos pela Coordenação/professores.
--                                           Os reportes de alunos tipo 'desatualizado' (simulado_material_reportes) entram
--                                           na mesma fila sem precisar de tabela nova.
-- O código tolera a ausência destas tabelas (tela mostra aviso de migração; nada mais quebra).

create table if not exists public.simulado_conteudo_atualizacoes (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  documento_id   uuid not null references public.simulado_conteudo_documentos(id) on delete cascade,
  versao_id      uuid,                                   -- versão do documento vigente no momento do registro (opcional)
  tipo           text not null check (tipo in ('legislacao','jurisprudencia','correcao','conteudo_novo')),
  texto          text not null check (char_length(btrim(texto)) between 1 and 2000),  -- "O que mudou" = Novidades da versão
  avisar_alunos  boolean not null default true,          -- notificação + e-mail aos alunos que têm o material
  mostrar_inicio boolean not null default true,          -- aparece nas novidades do Início do aluno
  origem_tipo    text check (origem_tipo in ('reporte','pedido')),
  origem_id      uuid,                                   -- reporte (simulado_material_reportes) ou pedido que originou
  criado_por     uuid,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_cont_atualiz_tenant_data on public.simulado_conteudo_atualizacoes (tenant_id, criado_em desc, id);
create index if not exists idx_cont_atualiz_doc on public.simulado_conteudo_atualizacoes (tenant_id, documento_id, criado_em desc);

create table if not exists public.simulado_conteudo_atualizacao_pedidos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  documento_id   uuid not null references public.simulado_conteudo_documentos(id) on delete cascade,
  texto          text not null check (char_length(btrim(texto)) between 1 and 2000),
  origem         text not null default 'Pedido da Coordenação Pedagógica',
  status         text not null default 'pendente' check (status in ('pendente','atendido','cancelado')),
  atualizacao_id uuid references public.simulado_conteudo_atualizacoes(id) on delete set null,
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  atendido_em    timestamptz
);
create index if not exists idx_cont_atualiz_ped_fila on public.simulado_conteudo_atualizacao_pedidos (tenant_id, status, criado_em desc);

alter table public.simulado_conteudo_atualizacoes enable row level security;
alter table public.simulado_conteudo_atualizacao_pedidos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_conteudo_atualizacoes' and policyname='cont_atualiz_tenant') then
    create policy cont_atualiz_tenant on public.simulado_conteudo_atualizacoes
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_conteudo_atualizacao_pedidos' and policyname='cont_atualiz_ped_tenant') then
    create policy cont_atualiz_ped_tenant on public.simulado_conteudo_atualizacao_pedidos
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

notify pgrst, 'reload schema';
