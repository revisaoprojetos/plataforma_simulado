-- Inbox de webhooks agora é MULTI-FONTE: além de guru/curseduca, aceita fontes genéricas
-- (Hotmart, Kiwify, Eduzz, n8n, etc.) via /api/webhooks/in/<token>?fonte=<nome>.
-- `fonte` rotula a origem para filtro/exibição (provider continua guardando o provedor técnico).

ALTER TABLE public.simulado_webhook_inbox ADD COLUMN IF NOT EXISTS fonte text;
CREATE INDEX IF NOT EXISTS idx_webhook_inbox_fonte ON public.simulado_webhook_inbox (tenant_id, fonte, recebido_em DESC);
