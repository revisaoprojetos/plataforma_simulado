-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — categorias cadastráveis
--
-- Antes, `categoria` era texto livre no cronograma. Isso convida a divergência:
-- "Específicos", "especificos" e "Específico" viram três categorias diferentes, e
-- agrupar o catálogo por elas passa a mentir.
--
-- Agora é CADASTRO por tenant, no mesmo desenho das plataformas de curso: a equipe
-- escolhe de uma lista, cria quando faltar, e renomear conserta em todo lugar de
-- uma vez.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_cronograma_categorias (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  nome          text NOT NULL,
  slug          text NOT NULL,               -- chave estável usada pela importação
  cor           text,                        -- opcional, para o chip na interface
  ordem         integer NOT NULL DEFAULT 0,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cron_categorias_slug
  ON public.simulado_cronograma_categorias (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cron_categorias_nome
  ON public.simulado_cronograma_categorias (tenant_id, lower(nome));

-- Semeia as três que a especificação registra (§10), por tenant.
INSERT INTO public.simulado_cronograma_categorias (tenant_id, nome, slug, ordem)
SELECT t.id, c.nome, c.slug, c.ordem
FROM public.simulado_tenants t
CROSS JOIN (VALUES
  ('Regulares',    'regulares',    0),
  ('Específicos',  'especificos',  1),
  ('Em Extinção',  'em-extincao',  2)
) AS c(nome, slug, ordem)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- O cronograma passa a referenciar a categoria.
ALTER TABLE public.simulado_cronogramas
  ADD COLUMN IF NOT EXISTS categoria_id uuid REFERENCES public.simulado_cronograma_categorias(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cronogramas_categoria
  ON public.simulado_cronogramas (tenant_id, categoria_id) WHERE deletado = false;

-- Slug sem depender da extensão `unaccent`, que nem todo projeto Supabase tem
-- habilitada: translate() cobre os acentos do português, que é o alfabeto em uso aqui.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_slugificar(t text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(
    regexp_replace(
      lower(translate(t, 'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
                         'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')),
      '[^a-z0-9]+', '-', 'g'),
    '-')
$$;

-- Migra o texto que já existir. Casa por nome normalizado (sem acento, minúsculo) para
-- pegar as variações de grafia; o que não casar vira categoria nova, em vez de sumir.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT tenant_id, btrim(categoria) AS nome
    FROM public.simulado_cronogramas
    WHERE categoria IS NOT NULL AND btrim(categoria) <> ''
  LOOP
    INSERT INTO public.simulado_cronograma_categorias (tenant_id, nome, slug, ordem)
    VALUES (r.tenant_id, r.nome, public.simulado_cronograma_slugificar(r.nome), 99)
    ON CONFLICT (tenant_id, slug) DO NOTHING;
  END LOOP;

  UPDATE public.simulado_cronogramas c
  SET categoria_id = cat.id
  FROM public.simulado_cronograma_categorias cat
  WHERE cat.tenant_id = c.tenant_id
    AND lower(cat.nome) = lower(btrim(c.categoria))
    AND c.categoria IS NOT NULL
    AND c.categoria_id IS NULL;
END $$;

-- A coluna de texto sai: duas fontes de verdade para a mesma informação é o problema
-- que esta migration existe para resolver.
ALTER TABLE public.simulado_cronogramas DROP COLUMN IF EXISTS categoria;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: mesmo isolamento por tenant das demais tabelas do módulo.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.simulado_cronograma_categorias ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS simulado_cronograma_categorias_isolation ON public.simulado_cronograma_categorias';
  EXECUTE $p$CREATE POLICY simulado_cronograma_categorias_isolation ON public.simulado_cronograma_categorias
    USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$;
END $$;

NOTIFY pgrst, 'reload schema';
