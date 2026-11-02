-- Produtos / Extensivos (Fase 1) — ver docs/produtos-extensivos-blueprint.md
-- Camada NOSSA, provider-agnóstica: um "produto/extensivo" agrega FONTES (grupo Curseduca /
-- produto Guru / manual / futuros) e define o CATÁLOGO que libera (conteúdo da Biblioteca,
-- videoaulas, simulados, desafios, cronograma). A concessão materializa nas tabelas de acesso
-- que já existem — nenhum gate novo em runtime.
-- Tabelas ADITIVAS. Padrão do projeto: RLS por simulado_tenant_acessos; o app usa service role (bypassa).

-- ─────────────────────────────────────────────────────────────────────────────
-- Entidade central: o produto/extensivo.
CREATE TABLE IF NOT EXISTS public.simulado_produtos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  nome           text NOT NULL,
  slug           text,                              -- opcional (futura área/showcase própria)
  tipo           text NOT NULL DEFAULT 'extensivo', -- extensivo|assinatura|pre_edital|sprint|amostra|mentoria|avulso|outro
  descricao      text,
  tier           text NOT NULL DEFAULT 'normal',    -- passaporte|vitalicio|normal → simulado_estudantes.classificacao
  validade_tipo  text NOT NULL DEFAULT 'vitalicio', -- vitalicio|dias|data_fixa
  validade_dias  integer,                           -- quando validade_tipo='dias' (a partir da concessão)
  validade_data  timestamptz,                       -- quando validade_tipo='data_fixa'
  ativo          boolean NOT NULL DEFAULT true,
  cor            text,
  capa_url       text,
  ordem          integer NOT NULL DEFAULT 0,
  criado_por     uuid,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_produtos_tenant ON public.simulado_produtos (tenant_id, ativo);

-- Fontes: COMO o aluno entra no produto (provider-agnóstico). fonte_ref null = entrada manual.
CREATE TABLE IF NOT EXISTS public.simulado_produto_fontes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  produto_id     uuid NOT NULL REFERENCES public.simulado_produtos(id) ON DELETE CASCADE,
  provider       text NOT NULL,                     -- curseduca|guru|manual|futuros
  fonte_ref      text,                              -- id do grupo Curseduca / produto Guru; null = manual
  fonte_nome     text,                              -- rótulo legível (auto-curado no sync)
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_produto_fontes_produto ON public.simulado_produto_fontes (produto_id);
-- 1 fonte externa pertence a 1 produto (manual, com fonte_ref null, não entra na restrição).
CREATE UNIQUE INDEX IF NOT EXISTS idx_produto_fontes_ref
  ON public.simulado_produto_fontes (tenant_id, provider, fonte_ref) WHERE fonte_ref IS NOT NULL;

-- Itens: O QUE o produto libera (catálogo). item_id = id do recurso do tipo_item.
CREATE TABLE IF NOT EXISTS public.simulado_produto_itens (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  produto_id     uuid NOT NULL REFERENCES public.simulado_produtos(id) ON DELETE CASCADE,
  tipo_item      text NOT NULL,                     -- grupo|banco|simulado|biblioteca_pasta|biblioteca_doc|desafio|cronograma
  item_id        uuid NOT NULL,
  permissoes     jsonb,                             -- biblioteca: {ler,baixar,grifar} (null = tudo)
  ativo          boolean NOT NULL DEFAULT true,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (produto_id, tipo_item, item_id)
);
CREATE INDEX IF NOT EXISTS idx_produto_itens_produto ON public.simulado_produto_itens (produto_id);

-- Aluno × produto: REUSA simulado_assinaturas (decisão travada). Liga ao produto interno + origem.
ALTER TABLE public.simulado_assinaturas ADD COLUMN IF NOT EXISTS produto_id uuid;
ALTER TABLE public.simulado_assinaturas ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'integracao'; -- integracao|manual
CREATE INDEX IF NOT EXISTS idx_assinaturas_produto ON public.simulado_assinaturas (produto_id) WHERE produto_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: isolamento por tenant do usuário logado (o app usa service role, que bypassa).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_produtos','simulado_produto_fontes','simulado_produto_itens'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
    EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
      USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
  END LOOP;
END $$;
