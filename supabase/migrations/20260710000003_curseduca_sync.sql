-- =========================================================
-- REGRAS de sincronização automática da Curseduca (polling)
-- O worker chama /api/cron/curseduca-sync a cada 60s; a rota roda as regras
-- que já venceram o intervalo (intervalo_min) e reimporta os grupos.
-- Cada regra escolhe seu próprio intervalo. Idempotente.
-- =========================================================
CREATE TABLE IF NOT EXISTS public.simulado_curseduca_sync (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid,
  grupos          integer[] NOT NULL DEFAULT '{}',   -- ids dos grupos Curseduca
  destino         jsonb,                             -- { tipo: 'nenhum'|'existente', grupoId? }
  sincronizar     boolean NOT NULL DEFAULT false,    -- remover do grupo quem saiu
  intervalo_min   integer NOT NULL DEFAULT 30,       -- 15 | 30 | 60 …
  ativo           boolean NOT NULL DEFAULT true,
  ultima_execucao timestamptz,
  ultimo_resultado jsonb,
  criado_por      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_curseduca_sync_ativos ON public.simulado_curseduca_sync (ativo, ultima_execucao) WHERE ativo;
CREATE INDEX IF NOT EXISTS idx_curseduca_sync_tenant ON public.simulado_curseduca_sync (tenant_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.simulado_curseduca_sync_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_curseduca_sync_touch ON public.simulado_curseduca_sync;
CREATE TRIGGER trg_curseduca_sync_touch BEFORE UPDATE ON public.simulado_curseduca_sync
  FOR EACH ROW EXECUTE FUNCTION public.simulado_curseduca_sync_touch();

ALTER TABLE public.simulado_curseduca_sync ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "curseduca_sync_admin_all" ON public.simulado_curseduca_sync;
  IF to_regclass('public.simulado_tenant_acessos') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY "curseduca_sync_admin_all"
        ON public.simulado_curseduca_sync FOR ALL
        TO authenticated
        USING (EXISTS (SELECT 1 FROM public.simulado_tenant_acessos ta
                       WHERE ta.user_id = auth.uid() AND ta.tenant_id = simulado_curseduca_sync.tenant_id AND ta.ativo))
        WITH CHECK (EXISTS (SELECT 1 FROM public.simulado_tenant_acessos ta
                       WHERE ta.user_id = auth.uid() AND ta.tenant_id = simulado_curseduca_sync.tenant_id AND ta.ativo));
    $pol$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
