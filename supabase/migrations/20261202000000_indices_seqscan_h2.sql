-- H2 (statement timeouts / queries pesadas): indices ausentes que causam seq scan em massa.
-- ADITIVA e IDEMPOTENTE. NAO APLICADA. Cada CREATE INDEX CONCURRENTLY deve rodar FORA de transacao,
-- um statement por vez (SQL editor / psql, nao dentro de BEGIN).
-- Evidencia (pg_stat_user_tables desde 23/10): simulado_estudantes 1,5M seq_scan / 38,9 bi tuplas lidas;
-- simulado_alternativas 868k seq_scan / 26 bi tuplas (SEM indice em questao_id).

-- 1) simulado_alternativas.questao_id (WHERE questao_id = $1 / = ANY($1), ~190k chamadas, seq scan 35k linhas cada)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_alternativas_questao
  ON public.simulado_alternativas (questao_id, ordem);

-- 2) simulado_estudantes: import Curseduca (lib/curseduca/import-core.ts:136-140) faz 4 lookups x 2,4M chamadas
--    por matricula_externa / email / cpf (tenant_id + deletado=false) sem indice -> seq scan em todas.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_estudantes_tenant_matricula
  ON public.simulado_estudantes (tenant_id, matricula_externa) WHERE deletado = false AND matricula_externa IS NOT NULL;

-- 3)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_estudantes_tenant_email
  ON public.simulado_estudantes (tenant_id, email) WHERE deletado = false;

-- 4)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_estudantes_tenant_cpf
  ON public.simulado_estudantes (tenant_id, cpf) WHERE deletado = false AND cpf IS NOT NULL;

-- 5) simulado_prova_questoes: filtros por simulado_id sem tenant_id (130k chamadas) -> seq scan (1,4 bi tuplas)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_prova_questoes_simulado_questao
  ON public.simulado_prova_questoes (simulado_id, questao_id);

-- 6) simulado_respostas_objetivas: 2,3M chamadas WHERE questao_id = ANY ORDER BY id LIMIT/OFFSET.
--    idx_simulado_respostas_questao (questao_id,id) tem 0 usos e 25 MB; planner prefere (questao_id,sessao_id) + sort.
--    Cobrir as colunas lidas evita ir ao heap (index-only) sem mudar a query.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_resp_obj_questao_id_cover
  ON public.simulado_respostas_objetivas (questao_id, id) INCLUDE (sessao_id, correta);

-- 7) simulado_pasta_estudantes: .eq(tenant_id).in(pasta_id) ORDER BY pasta_id (6,7M chamadas) usa idx so por pasta_id + filtro tenant.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_pasta_estud_tenant_pasta
  ON public.simulado_pasta_estudantes (tenant_id, pasta_id) INCLUDE (estudante_id);

-- 8) simulado_feedbacks_questao: 262k seq_scan, idx_scan 0 (indice parcial so status='pendente' nunca casa)
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_feedbacks_questao_questao
  ON public.simulado_feedbacks_questao (questao_id);

-- 9) simulado_favoritos: 151k seq_scan (idx_scan 58) -- so pkey
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_favoritos_estudante
  ON public.simulado_favoritos (estudante_id, questao_id);

-- (opcional, libera 25 MB + escrita) DROP INDEX CONCURRENTLY IF EXISTS public.idx_simulado_respostas_questao;  -- 0 usos
-- Depois de aplicar: rodar ANALYZE nas 4 tabelas (fora desta tarefa).
