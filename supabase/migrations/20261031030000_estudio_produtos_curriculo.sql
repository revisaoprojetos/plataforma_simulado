-- ============================================================================
-- ESTÚDIO DE CONTEÚDO — bloco PRODUTOS: pastas, instrutores e currículo leve
--
-- Encaixe do designer `revisao-admin-conteudos` (telas Produtos/Pasta/Produto/
-- ProdutoConteudos/ProdutoGrupos/...) no schema real `simulado_*`.
-- Ver docs/estudio-conteudo-implementacao.md (§2.4, Etapa 3 e Etapa 5-currículo).
--
-- Decisões aplicadas aqui:
--   1) Pastas de produto REUSAM simulado_pastas (folder_area='produto', is_folder,
--      pai_id) — produto ganha só a COLUNA pasta_id (hoje a lista é FLAT).
--   2) Currículo = LEVE POR REFERÊNCIA: módulo → item que APONTA a um recurso que
--      já existe (documento da Biblioteca / vídeo por URL / simulado / quiz / link).
--      SEM hospedar vídeo.
--
-- Padrão do projeto (não greenfield): isolamento manual por tenant_id nas queries
-- (service-role bypassa RLS); RLS habilitado por paridade com as demais tabelas;
-- soft-delete via deletado/deletado_em/deletado_por.
--
-- Idempotente: create table if not exists + add column if not exists + guards.
-- NÃO aplicar automaticamente. Aplicar manualmente e rodar: NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- ─────────────────── 1) Produto ganha pasta (organização) ───────────────────
-- pasta_id null = raiz de "Produtos". A pasta é uma simulado_pastas folder_area='produto'.
alter table public.simulado_produtos
  add column if not exists pasta_id uuid;

create index if not exists idx_produtos_pasta
  on public.simulado_produtos (tenant_id, pasta_id);

-- ─────────────────── 2) Instrutores do produto (→ users admin) ───────────────────
-- Snapshot de nome/email no momento do vínculo (a exibição não depende de re-ler auth.users).
create table if not exists public.simulado_produto_instrutores (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  produto_id uuid not null,
  user_id    uuid,                                   -- user admin (auth.users.id); nullable p/ avulso
  nome       text,
  email      text,
  ordem      int  not null default 0,
  criado_em  timestamptz not null default now(),
  unique (produto_id, user_id)
);

create index if not exists idx_produto_instrutores_prod
  on public.simulado_produto_instrutores (tenant_id, produto_id, ordem);

alter table public.simulado_produto_instrutores enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_produto_instrutores' and policyname='produto_instrutores_tenant') then
    create policy produto_instrutores_tenant on public.simulado_produto_instrutores
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- ─────────────────── 3) Currículo: módulos / submódulos ───────────────────
-- pai_id null = módulo de 1º nível; pai_id preenchido = submódulo ("aula-mãe").
-- disponibilidade jsonb: { tipo: na_matricula|data|intervalo|data_e_intervalo|dia_semana_e_intervalo, ... }
create table if not exists public.simulado_produto_modulos (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  produto_id      uuid not null,
  pai_id          uuid,                               -- submódulo → módulo pai
  titulo          text not null,
  imagem_url      text,
  descricao       text,
  ordem           int  not null default 0,
  exibicao        text not null default 'aberto',     -- aberto | recolhido
  disponibilidade jsonb not null default '{"tipo":"na_matricula"}'::jsonb,
  deletado        boolean not null default false,
  deletado_em     timestamptz,
  deletado_por    uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists idx_produto_modulos_prod
  on public.simulado_produto_modulos (tenant_id, produto_id, ordem) where deletado = false;
create index if not exists idx_produto_modulos_pai
  on public.simulado_produto_modulos (produto_id, pai_id) where deletado = false;

alter table public.simulado_produto_modulos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_produto_modulos' and policyname='produto_modulos_tenant') then
    create policy produto_modulos_tenant on public.simulado_produto_modulos
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- ─────────────────── 4) Currículo: itens (aulas) por REFERÊNCIA ───────────────────
-- Cada item APONTA a um recurso existente (não hospeda conteúdo):
--   tipo_ref ∈ documento_biblioteca (ref_id=simulado_conteudo_documentos.id)
--           | simulado          (ref_id=simulado_simulados.id)
--           | quiz              (ref_id=simulado_simulados.id, modo quiz)
--           | video_url         (ref_url = link YouTube/Vimeo/Panda/Drive)
--           | link              (ref_url = link externo)
-- subtipo: rótulo do material do designer (pdfull/pdflash/videoaula/slide/legproc/jurisclub/
--          video/documento/quiz/incorporacao/audio/texto/webinar/entrega/galeria/flashcards/scorm/formulario).
create table if not exists public.simulado_produto_modulo_itens (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  produto_id      uuid not null,
  modulo_id       uuid not null,
  ordem           int  not null default 0,
  tipo_ref        text not null,                      -- documento_biblioteca|video_url|simulado|quiz|link
  subtipo         text,                               -- rótulo do material (cosmético)
  ref_id          uuid,                               -- documento/simulado alvo (quando aplicável)
  ref_url         text,                               -- URL (vídeo/link)
  titulo          text not null,
  visibilidade    text not null default 'privado',    -- privado | publico
  situacao        text not null default 'ativo',      -- ativo | rascunho
  meta            jsonb not null default '{}'::jsonb,  -- { plataforma, embedUrl, abrirDentro, ... }
  disponibilidade jsonb not null default '{"tipo":"na_matricula"}'::jsonb,
  deletado        boolean not null default false,
  deletado_em     timestamptz,
  deletado_por    uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);

create index if not exists idx_produto_itens_modulo
  on public.simulado_produto_modulo_itens (tenant_id, modulo_id, ordem) where deletado = false;
create index if not exists idx_produto_itens_prod
  on public.simulado_produto_modulo_itens (tenant_id, produto_id) where deletado = false;

alter table public.simulado_produto_modulo_itens enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_produto_modulo_itens' and policyname='produto_modulo_itens_tenant') then
    create policy produto_modulo_itens_tenant on public.simulado_produto_modulo_itens
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- PostgREST: recarregar o schema cache para as tabelas/colunas novas aparecerem.
notify pgrst, 'reload schema';
