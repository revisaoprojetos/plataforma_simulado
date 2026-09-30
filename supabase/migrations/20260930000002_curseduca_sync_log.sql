-- Histórico de execuções da sync Curseduca (uma linha por job processado) — para PROVAR "48h sem erro"
-- e para o alerta de falha. Hoje só o `ultimo_resultado` da regra sobrevive (sobrescrito a cada run).
-- Tolerante: o cron grava best-effort; sem esta tabela o import segue funcionando.
CREATE TABLE IF NOT EXISTS simulado_curseduca_sync_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  job_id         uuid,
  ok             boolean NOT NULL DEFAULT false,
  novos          integer,
  ja_existiam    integer,
  removidos      integer,
  grupos_falhos  integer,
  erro           text,
  detalhe        jsonb,
  ms             integer,
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_curseduca_sync_log_tenant_data
  ON simulado_curseduca_sync_log (tenant_id, criado_em DESC);
-- Consulta do alerta: falhas recentes por tenant.
CREATE INDEX IF NOT EXISTS idx_curseduca_sync_log_falhas
  ON simulado_curseduca_sync_log (tenant_id, criado_em DESC) WHERE ok = false;
