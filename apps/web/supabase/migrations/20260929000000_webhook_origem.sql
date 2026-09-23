-- Origem/identificador por webhook de saída (ex.: "Lei Seca", "Acesso à plataforma", "Simulado").
-- Aparece como etiqueta no admin, nos logs de saída e no bloco `webhook` do payload — para
-- distinguir webhooks que hoje ficam genéricos (mesma URL, mesmo tenant). Migração-tolerante.
ALTER TABLE simulado_webhook_saida ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE simulado_webhook_saida_logs ADD COLUMN IF NOT EXISTS origem text;
