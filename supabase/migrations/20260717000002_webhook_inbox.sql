-- Inbox CRU de webhooks: registra TODA requisição que bate na URL do webhook, mesmo as
-- que falham (token inválido, payload malformado, evento ignorado). Serve para depurar o
-- que o provedor (Guru) realmente envia — estilo "executions" do n8n. Diferente de
-- simulado_integracao_eventos (que só guarda eventos já normalizados/processados).

CREATE TABLE IF NOT EXISTS public.simulado_webhook_inbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid,                    -- null quando o token não resolveu um tenant
  provider     text NOT NULL,
  metodo       text NOT NULL,           -- POST | GET
  token        text,                    -- token recebido na URL (exibido mascarado)
  ip           text,
  headers      jsonb,
  query        jsonb,
  body_raw     text,
  body_json    jsonb,
  status_resp  integer,                 -- HTTP status que devolvemos
  resultado    text,                    -- resumo curto (recebido/ignorado/erro/token inválido…)
  recebido_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_tenant ON public.simulado_webhook_inbox (tenant_id, provider, recebido_em DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_recent ON public.simulado_webhook_inbox (provider, recebido_em DESC);

-- RLS (o app usa service role e bypassa; mantém o padrão de isolamento por tenant).
ALTER TABLE public.simulado_webhook_inbox ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS simulado_webhook_inbox_isolation ON public.simulado_webhook_inbox;
CREATE POLICY simulado_webhook_inbox_isolation ON public.simulado_webhook_inbox
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));
