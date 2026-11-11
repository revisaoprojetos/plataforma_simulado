-- REGRAS POR SEGMENTO DENTRO DO PRODUTO (mesma lógica dos segmentos de visibilidade):
--
-- 1) simulado_produto_disponibilidade_seg — LIBERAÇÃO diferente por segmento. Para um módulo/aula, o aluno que
--    está no segmento recebe a `disponibilidade` desta regra NO LUGAR da disponibilidade base do item
--    (mesmo formato jsonb: tipo data | intervalo | data_e_intervalo | dia_semana_e_intervalo | na_matricula, antes…).
--    Várias regras casando: vale a de menor `prioridade` (empate: a mais antiga).
--
-- 2) simulado_produto_capas_seg — CAPA/IDENTIDADE diferente por segmento. Para um módulo (ou para o produto),
--    o aluno do segmento vê esta imagem (e, se preenchidos, título/descrição) no lugar da capa base.
--    Várias casando: menor `prioridade` vence.
--
-- Leitura tolerante: sem as tabelas nada muda para o aluno; a UI mostra o aviso da migração.
-- Aplicar manualmente (SQL editor) — inclui NOTIFY pgrst.

create table if not exists public.simulado_produto_disponibilidade_seg (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  produto_id     uuid not null references public.simulado_produtos(id) on delete cascade,
  segmento_id    uuid not null references public.simulado_segmentos(id) on delete cascade,
  alvo_tipo      text not null check (alvo_tipo in ('modulo','aula')),
  alvo_id        uuid not null,
  disponibilidade jsonb not null default '{"tipo":"na_matricula","antes":"bloqueado_cadeado"}'::jsonb,
  prioridade     int not null default 0,
  ativo          boolean not null default true,
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);
create index if not exists idx_prod_disp_seg_produto on public.simulado_produto_disponibilidade_seg (tenant_id, produto_id) where ativo = true;
create index if not exists idx_prod_disp_seg_alvo on public.simulado_produto_disponibilidade_seg (alvo_id);
create index if not exists idx_prod_disp_seg_segmento on public.simulado_produto_disponibilidade_seg (segmento_id);

create table if not exists public.simulado_produto_capas_seg (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  produto_id     uuid not null references public.simulado_produtos(id) on delete cascade,
  segmento_id    uuid not null references public.simulado_segmentos(id) on delete cascade,
  alvo_tipo      text not null check (alvo_tipo in ('produto','modulo')),
  alvo_id        uuid,  -- módulo; NULL quando alvo_tipo = 'produto'
  imagem_url     text,
  titulo         text check (titulo is null or char_length(titulo) <= 250),
  descricao      text check (descricao is null or char_length(descricao) <= 2000),
  ocultar_titulo boolean not null default false,
  prioridade     int not null default 0,
  ativo          boolean not null default true,
  criado_por     uuid,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  check ((alvo_tipo = 'produto') = (alvo_id is null)),
  check (imagem_url is not null or titulo is not null or descricao is not null)
);
create index if not exists idx_prod_capas_seg_produto on public.simulado_produto_capas_seg (tenant_id, produto_id) where ativo = true;
create index if not exists idx_prod_capas_seg_alvo on public.simulado_produto_capas_seg (alvo_id);
create index if not exists idx_prod_capas_seg_segmento on public.simulado_produto_capas_seg (segmento_id);

do $$
declare t text;
begin
  foreach t in array array['simulado_produto_disponibilidade_seg','simulado_produto_capas_seg'] loop
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
