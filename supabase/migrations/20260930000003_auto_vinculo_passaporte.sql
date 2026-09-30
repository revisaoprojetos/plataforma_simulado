-- =========================================================
-- Automação "Auto-vínculo Passaporte" (emenda do superior)
-- Todo dia (1x), varre as TURMAS da Curseduca cujo nome CASA os termos de inclusão
-- (padrão: "passaporte") e NÃO casa os de exclusão (padrão: "amostra") e enfileira um
-- import — que concede passaporte automaticamente (classificação + grupo "Passaporte").
-- Agendamento configurável pela plataforma: por HORÁRIO fixo do dia OU por INTERVALO.
-- Roda "carona" no tick de /api/cron/curseduca-sync (a cada 300s decide se venceu). 1 regra/tenant.
-- =========================================================
CREATE TABLE IF NOT EXISTS public.simulado_auto_vinculo_passaporte (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid UNIQUE,
  ativo            boolean NOT NULL DEFAULT false,
  modo             text    NOT NULL DEFAULT 'horario',       -- 'horario' | 'intervalo'
  horario          integer NOT NULL DEFAULT 3,              -- hora do dia (0-23), fuso America/Sao_Paulo
  intervalo_min    integer NOT NULL DEFAULT 1440,           -- quando modo='intervalo' (1440 = 1x/dia)
  termos_incluir   text[]  NOT NULL DEFAULT '{passaporte}', -- nome DEVE conter ao menos um destes
  termos_excluir   text[]  NOT NULL DEFAULT '{amostra}',    -- nome NÃO pode conter nenhum destes
  sincronizar      boolean NOT NULL DEFAULT false,          -- (não usado no enfileiramento: só concede, nunca remove)
  ultima_execucao  timestamptz,
  ultimo_resultado jsonb,
  criado_por       uuid,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_vinc_pass_ativos ON public.simulado_auto_vinculo_passaporte (ativo) WHERE ativo;

CREATE OR REPLACE FUNCTION public.simulado_auto_vinculo_passaporte_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_auto_vinc_pass_touch ON public.simulado_auto_vinculo_passaporte;
CREATE TRIGGER trg_auto_vinc_pass_touch BEFORE UPDATE ON public.simulado_auto_vinculo_passaporte
  FOR EACH ROW EXECUTE FUNCTION public.simulado_auto_vinculo_passaporte_touch();

ALTER TABLE public.simulado_auto_vinculo_passaporte ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  DROP POLICY IF EXISTS "auto_vinc_pass_admin_all" ON public.simulado_auto_vinculo_passaporte;
  IF to_regclass('public.simulado_tenant_acessos') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY "auto_vinc_pass_admin_all"
        ON public.simulado_auto_vinculo_passaporte FOR ALL
        TO authenticated
        USING (EXISTS (SELECT 1 FROM public.simulado_tenant_acessos ta
                       WHERE ta.user_id = auth.uid() AND ta.tenant_id = simulado_auto_vinculo_passaporte.tenant_id AND ta.ativo))
        WITH CHECK (EXISTS (SELECT 1 FROM public.simulado_tenant_acessos ta
                       WHERE ta.user_id = auth.uid() AND ta.tenant_id = simulado_auto_vinculo_passaporte.tenant_id AND ta.ativo));
    $pol$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
