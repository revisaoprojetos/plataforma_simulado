-- Produtos/Extensivos — VITRINE + identidade visual (rebuild baseado na área real da Curseduca).
-- A área de um produto é uma VITRINE montada por SEÇÕES (banner + carrosséis de conteúdo nomeados,
-- cada um com tamanho/layout e seus itens), sobre um branding próprio (tema/cores/logo/banner).
-- Aditivo, RLS por simulado_tenant_acessos. Ver docs/produtos-extensivos-blueprint.md.

-- Identidade visual rica no produto (além de cor/capa_url que já existem).
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS tema              text NOT NULL DEFAULT 'claro';   -- claro | escuro
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS cor_secundaria    text;
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS logo_url          text;
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS banner_url        text;
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS banner_mobile_url text;
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS gamificacao       boolean NOT NULL DEFAULT false;

-- Seções da vitrine (ordenadas). tipo: 'banner' | 'carrossel'.
--   banner    → config: { imagem, imagem_mobile, link }
--   carrossel → nome + tamanho/ordenacao + itens[] (o que é apresentado = {tipo_item,item_id}[])
CREATE TABLE IF NOT EXISTS public.simulado_produto_secoes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  produto_id  uuid NOT NULL REFERENCES public.simulado_produtos(id) ON DELETE CASCADE,
  ordem       integer NOT NULL DEFAULT 0,
  tipo        text NOT NULL DEFAULT 'carrossel',             -- banner | carrossel
  nome        text,
  tamanho     text NOT NULL DEFAULT 'vertical_small',        -- vertical_small|vertical_large|horizontal_small|horizontal_large|destaque
  ordenacao   text NOT NULL DEFAULT 'manual',                -- manual | alfabetica | recentes
  config      jsonb NOT NULL DEFAULT '{}',                   -- banner: {imagem,imagem_mobile,link}; carrossel: {itens:[{tipo_item,item_id}]}
  ativo       boolean NOT NULL DEFAULT true,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_produto_secoes_produto ON public.simulado_produto_secoes (produto_id, ordem);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.simulado_produto_secoes ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS simulado_produto_secoes_isolation ON public.simulado_produto_secoes';
  EXECUTE $p$CREATE POLICY simulado_produto_secoes_isolation ON public.simulado_produto_secoes
    USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))$p$;
END $$;
