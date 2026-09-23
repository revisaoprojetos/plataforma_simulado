-- Log de ENTREGAS dos webhooks de saída (histórico, além do ultimo_status na linha do webhook).
-- Cada disparo grava uma linha: evento, url, status (ok/erro), http_status, tempo (ms) e erro.
-- Alimenta a sub-aba "Logs de saída" em Conexões → Webhooks. Tolerante: o dispatch grava best-effort;
-- sem esta tabela, o envio segue funcionando (só não registra o histórico).
CREATE TABLE IF NOT EXISTS simulado_webhook_saida_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  webhook_id   uuid,
  nome         text,
  url          text,
  evento       text,
  status       text,        -- 'ok' | 'erro'
  http_status  integer,
  ms           integer,
  erro         text,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

-- Consulta padrão: por tenant, mais recentes primeiro (a UI pagina por aqui).
CREATE INDEX IF NOT EXISTS idx_webhook_saida_logs_tenant_data
  ON simulado_webhook_saida_logs (tenant_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_webhook_saida_logs_webhook
  ON simulado_webhook_saida_logs (webhook_id, criado_em DESC);
