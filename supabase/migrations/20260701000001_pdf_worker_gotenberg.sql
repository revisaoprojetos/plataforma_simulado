-- =========================================================
-- PDF ASSÍNCRONO via WORKER + GOTENBERG
-- - Bucket público `pdfs` (aceita application/pdf) para os PDFs gerados.
-- - Tabela `simulado_pdf_jobs`: rastreia cada geração (fila BullMQ → Gotenberg),
--   para a UI acompanhar (pendente/processando/concluido/erro) e baixar o link.
-- App/worker usam service-role (bypassa RLS). RLS liga p/ leitura de admin no front.
-- NÃO mexe em mentoria_*. Idempotente.
-- =========================================================

-- 1. Bucket de saída dos PDFs (público, só PDF)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('pdfs', 'pdfs', true, 52428800, ARRAY['application/pdf'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "pdfs_public_read" ON storage.objects;
CREATE POLICY "pdfs_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'pdfs');

-- 2. Registro dos jobs de PDF
CREATE TABLE IF NOT EXISTS public.simulado_pdf_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,
  tipo         text NOT NULL,              -- 'caderno' | 'resultado' | 'relatorio'
  referencia   text,                       -- id do caderno/sessão/simulado que originou
  titulo       text,                       -- rótulo amigável p/ exibir na lista
  status       text NOT NULL DEFAULT 'pendente', -- pendente|processando|concluido|erro
  arquivo_path text,                       -- caminho no bucket `pdfs`
  arquivo_url  text,                       -- URL pública do PDF
  erro         text,
  criado_por   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_tenant   ON public.simulado_pdf_jobs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pdf_jobs_status   ON public.simulado_pdf_jobs (status) WHERE status IN ('pendente','processando');

-- carimbo de updated_at
CREATE OR REPLACE FUNCTION public.simulado_pdf_jobs_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_pdf_jobs_touch ON public.simulado_pdf_jobs;
CREATE TRIGGER trg_pdf_jobs_touch BEFORE UPDATE ON public.simulado_pdf_jobs
  FOR EACH ROW EXECUTE FUNCTION public.simulado_pdf_jobs_touch();

ALTER TABLE public.simulado_pdf_jobs ENABLE ROW LEVEL SECURITY;

-- Admin autenticado do tenant enxerga/gerencia (service-role do worker/web bypassa).
DROP POLICY IF EXISTS "pdf_jobs_admin_all" ON public.simulado_pdf_jobs;
CREATE POLICY "pdf_jobs_admin_all"
  ON public.simulado_pdf_jobs FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.simulado_tenant_acessos ta
            WHERE ta.user_id = auth.uid() AND ta.tenant_id = simulado_pdf_jobs.tenant_id AND ta.ativo)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.simulado_tenant_acessos ta
            WHERE ta.user_id = auth.uid() AND ta.tenant_id = simulado_pdf_jobs.tenant_id AND ta.ativo)
  );

NOTIFY pgrst, 'reload schema';
