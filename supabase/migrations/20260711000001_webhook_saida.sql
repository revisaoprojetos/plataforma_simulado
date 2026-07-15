-- Webhooks de saída (Conexões): notificam sistemas externos (n8n, Zapier, etc.)
-- sobre a progressão do estudante — iniciou / finalizou / visualizou/baixou relatório / não finalizou.
CREATE TABLE IF NOT EXISTS public.simulado_webhook_saida (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  nome         text NOT NULL,
  url          text NOT NULL,
  eventos      jsonb NOT NULL DEFAULT '[]',   -- lista de eventos assinados
  secret       text,                          -- opcional: assinatura HMAC-SHA256
  ativo        boolean NOT NULL DEFAULT true,
  ultimo_status text,                          -- resultado do último envio
  ultimo_envio timestamptz,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_saida_tenant ON public.simulado_webhook_saida (tenant_id, ativo);

ALTER TABLE public.simulado_webhook_saida ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS simulado_webhook_saida_isolation ON public.simulado_webhook_saida;
CREATE POLICY simulado_webhook_saida_isolation ON public.simulado_webhook_saida
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));
