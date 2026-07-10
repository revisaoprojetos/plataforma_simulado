-- =========================================================
-- CREDENCIAIS DA CURSEDUCA POR TENANT
-- Cada tenant pode ter sua própria conta Curseduca (api_key/usuário/senha).
-- Sem linha aqui, o app cai para as credenciais globais do .env (CURSEDUCA_*).
-- Lido pelo web via service-role (bypassa RLS). RLS ligado nega acesso anônimo.
-- Idempotente.
-- =========================================================
CREATE TABLE IF NOT EXISTS public.simulado_curseduca_config (
  tenant_id     uuid PRIMARY KEY,
  base_url      text NOT NULL DEFAULT 'https://prof.curseduca.pro',
  api_key       text,
  usuario       text,
  senha         text,                 -- credencial de serviço (só service-role lê)
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.simulado_curseduca_config ENABLE ROW LEVEL SECURITY;

-- Admin autenticado do tenant pode gerenciar pela UI (o web usa service-role de qualquer forma).
-- Só cria a policy se a tabela de acessos existir com esse nome — assim a migration nunca falha.
DO $$
BEGIN
  DROP POLICY IF EXISTS "curseduca_config_admin_all" ON public.simulado_curseduca_config;
  IF to_regclass('public.simulado_tenant_acessos') IS NOT NULL THEN
    EXECUTE $pol$
      CREATE POLICY "curseduca_config_admin_all"
        ON public.simulado_curseduca_config FOR ALL
        TO authenticated
        USING (EXISTS (SELECT 1 FROM public.simulado_tenant_acessos ta
                       WHERE ta.user_id = auth.uid() AND ta.tenant_id = simulado_curseduca_config.tenant_id AND ta.ativo))
        WITH CHECK (EXISTS (SELECT 1 FROM public.simulado_tenant_acessos ta
                       WHERE ta.user_id = auth.uid() AND ta.tenant_id = simulado_curseduca_config.tenant_id AND ta.ativo));
    $pol$;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
