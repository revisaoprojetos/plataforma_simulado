-- Auditoria (admin): índices para a listagem de simulado_audit_logs (1,09 mi linhas / 1,2 GB).
-- Hoje só existem (tenant_id, entidade, criado_em) e (tenant_id, entidade_id, criado_em): nenhum serve
-- "WHERE tenant_id=? [AND operacao IN (...)] ORDER BY criado_em DESC LIMIT 12" => Parallel Seq Scan (~6 s).
--
-- ATENÇÃO: CREATE INDEX CONCURRENTLY NÃO roda dentro de transação. No SQL Editor do Supabase rode
-- UM COMANDO POR VEZ (selecione só o CREATE INDEX e execute), ou via psql sem BEGIN. Não bloqueia escrita,
-- mas leva ~1-3 min cada (varre 1,2 GB). Se falhar/cancelar, sobra índice INVALID: DROP INDEX CONCURRENTLY <nome>
-- e rode de novo. Idempotente (IF NOT EXISTS). Tamanho estimado total ~100-110 MB.

-- 1) Aba "Todos" e "Modificações" (IN das 7 operações cobre ~95% das linhas; o filtro roda sobre o índice
--    ordenado e o LIMIT 12 para cedo). ~45-50 MB.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_audit_logs_tenant_criado
  ON public.simulado_audit_logs (tenant_id, criado_em DESC);

-- 2) Aba "Acessos" (admins e estudantes): só ~47 mil linhas (LOGIN/LOGOUT/BLOQUEIO_AUTOMATICO) => índice
--    parcial minúsculo (~2-3 MB). O IN() da página é idêntico ao predicado, então o planner o usa; o
--    filtro por ator_tipo (admin x estudante) roda sobre poucas linhas.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_audit_logs_tenant_criado_acessos
  ON public.simulado_audit_logs (tenant_id, criado_em DESC)
  WHERE operacao IN ('LOGIN', 'LOGOUT', 'BLOQUEIO_AUTOMATICO');

-- 3) Filtro "Ação" (operacao = X) com ordenação por data: ações raras (BLOQUEAR ~120, ANULAR) com o índice 1
--    varreriam o tenant todo. ~55-60 MB.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_audit_logs_tenant_operacao_criado
  ON public.simulado_audit_logs (tenant_id, operacao, criado_em DESC);

-- Depois de criar: ANALYZE public.simulado_audit_logs;
