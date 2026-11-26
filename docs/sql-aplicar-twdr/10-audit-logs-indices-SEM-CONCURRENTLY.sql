-- =====================================================================================================================
-- 10-audit-logs-indices-SEM-CONCURRENTLY — 3 índices de listagem em simulado_audit_logs (origem 20261124000000, sem CONCURRENTLY)
-- Projeto alvo: twdrtlxkjvunkdobudev (SQL Editor do Supabase). Cole numa ABA NOVA e rode inteiro (o Editor já usa transação).
-- Idempotente. Sem CONCURRENTLY/VACUUM. Risco: ALTO: tabela 1,09 mi linhas/1,2 GB; cada índice varre a tabela (~30-120 s) e BLOQUEIA INSERT (logins/auditoria) durante a criação. RODAR FORA DO PICO
-- Ver LEIAME.md (ordem, verificação).
-- =====================================================================================================================
SET LOCAL lock_timeout = '15s';

SET LOCAL statement_timeout = '10min';
SET LOCAL lock_timeout = '30s';
CREATE INDEX IF NOT EXISTS ix_simulado_audit_logs_tenant_criado
  ON public.simulado_audit_logs (tenant_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS ix_simulado_audit_logs_tenant_criado_acessos
  ON public.simulado_audit_logs (tenant_id, criado_em DESC)
  WHERE operacao IN ('LOGIN', 'LOGOUT', 'BLOQUEIO_AUTOMATICO');
CREATE INDEX IF NOT EXISTS ix_simulado_audit_logs_tenant_operacao_criado
  ON public.simulado_audit_logs (tenant_id, operacao, criado_em DESC);
ANALYZE public.simulado_audit_logs;

NOTIFY pgrst, 'reload schema';
