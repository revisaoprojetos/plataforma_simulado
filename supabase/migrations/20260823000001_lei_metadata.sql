-- ═══════════════════════════════════════════════════════════════════════════
-- Plataforma "Lei Seca" — Fase A / Fatia A1: LEI (metadados) + MATÉRIAS + slug.
--
-- Evolui a Área de Leitura: "documento" passa a poder ser uma LEI com metadados
-- (tipo/número/ano/título oficial/ementa/matéria/situação editorial) e organização
-- por MATÉRIA. Tudo ADITIVO e nullable → documentos genéricos seguem idênticos.
-- Não toca as migrações 20260822000001/2/3 já aplicadas.
-- ═══════════════════════════════════════════════════════════════════════════

-- Matérias (áreas do direito) ----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simulado_materias (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  nome          text NOT NULL,
  slug          text,
  descricao     text,
  cor           text,
  icone         text,
  ordem         integer NOT NULL DEFAULT 0,
  deletado      boolean NOT NULL DEFAULT false,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_simulado_materias_tenant ON public.simulado_materias(tenant_id, deletado, ordem);

-- Histórico de slugs de lei (para redirecionar links antigos) ---------------------
CREATE TABLE IF NOT EXISTS public.simulado_lei_slug_historico (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  documento_id uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  slug         text NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, slug)
);
CREATE INDEX IF NOT EXISTS idx_simulado_lei_slug_hist_doc ON public.simulado_lei_slug_historico(documento_id);

-- Metadados de lei em simulado_documentos (aditivo, nullable) ---------------------
ALTER TABLE public.simulado_documentos
  ADD COLUMN IF NOT EXISTS materia_id         uuid,
  ADD COLUMN IF NOT EXISTS tipo_norma         text,
  ADD COLUMN IF NOT EXISTS numero             text,
  ADD COLUMN IF NOT EXISTS ano                integer,
  ADD COLUMN IF NOT EXISTS titulo_oficial     text,
  ADD COLUMN IF NOT EXISTS ementa             text,
  ADD COLUMN IF NOT EXISTS slug               text,
  ADD COLUMN IF NOT EXISTS esfera             text,
  ADD COLUMN IF NOT EXISTS fonte_oficial      text,
  ADD COLUMN IF NOT EXISTS ultima_verificacao date,
  ADD COLUMN IF NOT EXISTS ordem              integer,
  ADD COLUMN IF NOT EXISTS situacao_editorial text DEFAULT 'em_preparacao';

CREATE INDEX IF NOT EXISTS idx_simulado_documentos_materia  ON public.simulado_documentos(materia_id);
CREATE INDEX IF NOT EXISTS idx_simulado_documentos_slug     ON public.simulado_documentos(tenant_id, slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_simulado_documentos_situacao ON public.simulado_documentos(tenant_id, situacao_editorial);

-- RLS por tenant (mesmo padrão simulado_*) nas tabelas NOVAS.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_materias','simulado_lei_slug_historico'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "tenant_isolation_%s" ON public.%I FOR ALL TO authenticated
      USING (tenant_id IN (SELECT public.user_tenant_ids()))
      WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))', t, t);
    EXECUTE format('GRANT ALL ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
