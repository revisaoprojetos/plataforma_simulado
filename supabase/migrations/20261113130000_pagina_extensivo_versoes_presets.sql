-- EDITOR VISUAL da página do extensivo — versões (rascunho × publicado × arquivado) e presets.
--  • simulado_produto_pagina_versoes: 1 linha por versão da página (blocos V1 em jsonb). No máx. 1 'rascunho' e 1 'publicado' por produto;
--    ao publicar, o publicado anterior vira 'arquivado' (histórico). Produto SEM linha aqui = página derivada do legado (simulado_produto_secoes).
--  • simulado_pagina_presets: modelos reutilizáveis de página (tenant_id NULL = global).
-- Código TOLERANTE à ausência destas tabelas (cai na derivação legada). Aditiva e idempotente. Acesso real só pelo servidor (service role).
-- Aplicar com `pnpm migracoes aplicar`.

CREATE TABLE IF NOT EXISTS public.simulado_produto_pagina_versoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  produto_id   uuid NOT NULL REFERENCES public.simulado_produtos(id) ON DELETE CASCADE,
  estado       text NOT NULL DEFAULT 'rascunho' CHECK (estado IN ('rascunho','publicado','arquivado')),
  blocos       jsonb NOT NULL DEFAULT '[]'::jsonb,   -- BlocoV1[] (lib/produtos/pagina/tipos.ts)
  tema         jsonb NOT NULL DEFAULT '{}'::jsonb,   -- TemaPagina (só nomes de tokens, nunca hex)
  rotulo       text,
  criado_por   uuid,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  publicado_em timestamptz
);
CREATE INDEX IF NOT EXISTS idx_pagina_versoes_produto
  ON public.simulado_produto_pagina_versoes (tenant_id, produto_id, estado, criado_em DESC);
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagina_versoes_1_rascunho
  ON public.simulado_produto_pagina_versoes (produto_id) WHERE estado = 'rascunho';
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagina_versoes_1_publicado
  ON public.simulado_produto_pagina_versoes (produto_id) WHERE estado = 'publicado';

CREATE TABLE IF NOT EXISTS public.simulado_pagina_presets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid,                                  -- NULL = preset global (visível a todos os tenants)
  nome        text NOT NULL,
  descricao   text,
  blocos      jsonb NOT NULL DEFAULT '[]'::jsonb,
  tema        jsonb NOT NULL DEFAULT '{}'::jsonb,
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pagina_presets_tenant ON public.simulado_pagina_presets (tenant_id, criado_em DESC);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.simulado_produto_pagina_versoes ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS simulado_produto_pagina_versoes_isolation ON public.simulado_produto_pagina_versoes';
  EXECUTE $p$CREATE POLICY simulado_produto_pagina_versoes_isolation ON public.simulado_produto_pagina_versoes
    USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))$p$;

  EXECUTE 'ALTER TABLE public.simulado_pagina_presets ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS simulado_pagina_presets_isolation ON public.simulado_pagina_presets';
  -- leitura: do próprio tenant OU global; escrita: só do próprio tenant (global só via service role)
  EXECUTE $p$CREATE POLICY simulado_pagina_presets_isolation ON public.simulado_pagina_presets
    USING (tenant_id IS NULL OR tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))$p$;
END $$;

GRANT ALL ON public.simulado_produto_pagina_versoes TO service_role;
GRANT ALL ON public.simulado_pagina_presets TO service_role;

NOTIFY pgrst, 'reload schema';
