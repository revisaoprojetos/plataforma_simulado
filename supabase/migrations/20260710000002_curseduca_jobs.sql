-- =========================================================
-- JOBS de importação da Curseduca (em segundo plano)
-- O web enfileira (status=pendente); o worker chama /api/cron/curseduca-jobs
-- a cada 60s, que processa e atualiza o job. A UI acompanha pelo status.
-- Lido/escrito pelo web via service-role. Idempotente.
-- =========================================================
CREATE TABLE IF NOT EXISTS public.simulado_curseduca_jobs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,
  status       text NOT NULL DEFAULT 'pendente', -- pendente|processando|concluido|erro
  grupos       integer[] NOT NULL DEFAULT '{}',  -- ids dos grupos Curseduca
  destino      jsonb,                            -- { tipo, grupoId?, nomeNovo? }
  sincronizar  boolean NOT NULL DEFAULT false,
  resultado    jsonb,                            -- ResultadoImportCurseduca
  erro         text,
  criado_por   uuid,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_curseduca_jobs_pendentes ON public.simulado_curseduca_jobs (created_at) WHERE status IN ('pendente','processando');
CREATE INDEX IF NOT EXISTS idx_curseduca_jobs_tenant ON public.simulado_curseduca_jobs (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.simulado_curseduca_jobs_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_curseduca_jobs_touch ON public.simulado_curseduca_jobs;
CREATE TRIGGER trg_curseduca_jobs_touch BEFORE UPDATE ON public.simulado_curseduca_jobs
  FOR EACH ROW EXECUTE FUNCTION public.simulado_curseduca_jobs_touch();

ALTER TABLE public.simulado_curseduca_jobs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "curseduca_jobs_admin_all" ON public.simulado_curseduca_jobs;
  IF to_regclass('public.simulado_tenant_acessos') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY "curseduca_jobs_admin_all"
        ON public.simulado_curseduca_jobs FOR ALL
        TO authenticated
        USING (EXISTS (SELECT 1 FROM public.simulado_tenant_acessos ta
                       WHERE ta.user_id = auth.uid() AND ta.tenant_id = simulado_curseduca_jobs.tenant_id AND ta.ativo))
        WITH CHECK (EXISTS (SELECT 1 FROM public.simulado_tenant_acessos ta
                       WHERE ta.user_id = auth.uid() AND ta.tenant_id = simulado_curseduca_jobs.tenant_id AND ta.ativo));
    $pol$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
