-- VERSAO SEM CONCURRENTLY dos indices de 20261202000000_indices_seqscan_h2.sql, para rodar de uma vez no SQL Editor do Supabase (que executa em transacao).
-- Cada CREATE INDEX trava ESCRITAS na tabela por alguns segundos durante a criacao: rode fora do horario de pico. Idempotente (IF NOT EXISTS).
-- NAO rode junto com a versao CONCURRENTLY.

-- 1) simulado_alternativas.questao_id (WHERE questao_id = $1 / = ANY($1), ~190k chamadas, seq scan 35k linhas cada)
CREATE INDEX IF NOT EXISTS ix_simulado_alternativas_questao
  ON public.simulado_alternativas (questao_id, ordem);

-- 2) simulado_estudantes: import Curseduca (lib/curseduca/import-core.ts:136-140) faz 4 lookups x 2,4M chamadas
--    por matricula_externa / email / cpf (tenant_id + deletado=false) sem indice -> seq scan em todas.
CREATE INDEX IF NOT EXISTS ix_simulado_estudantes_tenant_matricula
  ON public.simulado_estudantes (tenant_id, matricula_externa) WHERE deletado = false AND matricula_externa IS NOT NULL;

-- 3)
CREATE INDEX IF NOT EXISTS ix_simulado_estudantes_tenant_email
  ON public.simulado_estudantes (tenant_id, email) WHERE deletado = false;

-- 4)
CREATE INDEX IF NOT EXISTS ix_simulado_estudantes_tenant_cpf
  ON public.simulado_estudantes (tenant_id, cpf) WHERE deletado = false AND cpf IS NOT NULL;

-- 5) simulado_prova_questoes: filtros por simulado_id sem tenant_id (130k chamadas) -> seq scan (1,4 bi tuplas)
CREATE INDEX IF NOT EXISTS ix_simulado_prova_questoes_simulado_questao
  ON public.simulado_prova_questoes (simulado_id, questao_id);

-- 6) simulado_respostas_objetivas: 2,3M chamadas WHERE questao_id = ANY ORDER BY id LIMIT/OFFSET.
--    idx_simulado_respostas_questao (questao_id,id) tem 0 usos e 25 MB; planner prefere (questao_id,sessao_id) + sort.
--    Cobrir as colunas lidas evita ir ao heap (index-only) sem mudar a query.
CREATE INDEX IF NOT EXISTS ix_resp_obj_questao_id_cover
  ON public.simulado_respostas_objetivas (questao_id, id) INCLUDE (sessao_id, correta);

-- 7) simulado_pasta_estudantes: .eq(tenant_id).in(pasta_id) ORDER BY pasta_id (6,7M chamadas) usa idx so por pasta_id + filtro tenant.
CREATE INDEX IF NOT EXISTS ix_pasta_estud_tenant_pasta
  ON public.simulado_pasta_estudantes (tenant_id, pasta_id) INCLUDE (estudante_id);

-- 8) simulado_feedbacks_questao: 262k seq_scan, idx_scan 0 (indice parcial so status='pendente' nunca casa)
CREATE INDEX IF NOT EXISTS ix_feedbacks_questao_questao
  ON public.simulado_feedbacks_questao (questao_id);

-- 9) simulado_favoritos: 151k seq_scan (idx_scan 58) -- so pkey
CREATE INDEX IF NOT EXISTS ix_favoritos_estudante
  ON public.simulado_favoritos (estudante_id, questao_id);


ANALYZE public.simulado_alternativas;
ANALYZE public.simulado_estudantes;
ANALYZE public.simulado_prova_questoes;
ANALYZE public.simulado_respostas_objetivas;
