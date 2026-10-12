-- Biblioteca do Desafio: blocos HTML pré-prontos + tags (selos), organizados em PASTAS/SUBPASTAS.
-- As pastas reusam simulado_pastas com folder_area='biblioteca' (Conteúdos) e 'biblioteca_tag' (Tags)
-- — valor livre, SEM migração (igual caderno_modelo). Aqui só a tabela dos ITENS. Aplicação MANUAL,
-- idempotente. App acessa via service role (createAdminClient): RLS ligado.

CREATE TABLE IF NOT EXISTS public.simulado_biblioteca_itens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  pasta_id      uuid,                          -- simulado_pastas (folder_area='biblioteca'|'biblioteca_tag'); null = raiz
  tipo          text NOT NULL DEFAULT 'conteudo', -- 'conteudo' | 'tag'
  nome          text NOT NULL,
  descricao     text,
  html          text NOT NULL DEFAULT '',      -- HTML pronto p/ inserir no editor
  slug          text,                          -- (tags) código da tag, ex.: 'rg'
  ordem         integer,
  deletado      boolean NOT NULL DEFAULT false,
  deletado_em   timestamptz,
  deletado_por  uuid,
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_biblioteca_itens_tenant ON public.simulado_biblioteca_itens (tenant_id, tipo) WHERE deletado = false;
CREATE INDEX IF NOT EXISTS idx_biblioteca_itens_pasta  ON public.simulado_biblioteca_itens (pasta_id);

ALTER TABLE public.simulado_biblioteca_itens ENABLE ROW LEVEL SECURITY;
