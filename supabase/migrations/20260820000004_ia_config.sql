-- ═══════════════════════════════════════════════════════════════════════════
-- Transcrição/correção por IA de VISÃO — chave de API POR TENANT (multi-provedor).
--
-- A chave é um SEGREDO de SAÍDA (usada p/ chamar Anthropic/OpenAI/Google) → precisa
-- ser RECUPERÁVEL, então é guardada CRIPTOGRAFADA (AES-256-GCM no app), nunca em texto
-- e NUNCA exposta ao browser. O `provider` é detectado a partir do formato da chave.
-- Uma config por tenant (o provedor "ativo" de transcrição).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_ia_config (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.simulado_tenants(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('anthropic','openai','gemini')),
  modelo          text NOT NULL,
  api_key_cipher  text NOT NULL,               -- AES-256-GCM: iv:tag:ciphertext (base64)
  api_key_mascara text,                        -- ex.: "sk-ant…AB12" p/ a UI
  ativo           boolean NOT NULL DEFAULT true,
  testada_em      timestamptz,                 -- última validação bem-sucedida
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

ALTER TABLE public.simulado_ia_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ia_config_isolation ON public.simulado_ia_config;
CREATE POLICY ia_config_isolation ON public.simulado_ia_config
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulado_ia_config TO authenticated;
GRANT ALL ON public.simulado_ia_config TO service_role;
