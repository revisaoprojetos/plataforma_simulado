-- Stale-lock recovery da fila de import da Curseduca.
-- Sem um carimbo de "quando o job foi travado", um job que morre no meio (corte de proxy,
-- réplica reiniciada) fica preso em `processando` para sempre e a fila entope silenciosamente.
-- `locked_at` permite reverter para `pendente` os jobs travados há muito tempo.
ALTER TABLE simulado_curseduca_jobs ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_curseduca_jobs_status_locked
  ON simulado_curseduca_jobs (status, locked_at);

-- Mesma recuperação de lock preso para a fila de reprocessamento de eventos de webhook (Guru etc.):
-- um evento travado em `processando` por um tick de cron que morreu ficava fora de qualquer varredura.
ALTER TABLE simulado_integracao_eventos ADD COLUMN IF NOT EXISTS locked_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_integracao_eventos_status_locked
  ON simulado_integracao_eventos (status, locked_at);
