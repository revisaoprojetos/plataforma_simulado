-- Fase 0.2 do roadmap de arquitetura: índices que faltam para relatórios e re-correção.
--
-- A tabela simulado_respostas_objetivas só tem índice em (sessao_id) — vindo do motor
-- 20260626000002. As queries de RELATÓRIO DE TURMA e de RE-CORREÇÃO filtram por
-- questao_id (`.in('questao_id', ...)` em estudantes/_dados.ts, disciplinas/_dados.ts,
-- ranking/_dados.ts e no processor de re-correção), o que hoje faz SEQ SCAN na tabela
-- inteira. Com dezenas de milhares de respostas isso é um dos maiores gargalos.
--
-- CONCURRENTLY: cria o índice SEM travar escritas (seguro rodar com prova em andamento).
-- ⚠️ CONCURRENTLY não roda dentro de transação. No SQL Editor do Supabase, rode CADA
--    comando SEPARADAMENTE (um de cada vez), não o script inteiro de uma vez.
--
-- Auditoria do estado atual (rode antes, para conferir o que já existe):
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'simulado_respostas_objetivas' ORDER BY indexname;

-- 1) Filtro por questão (turma × aluno, re-correção). Inclui id p/ casar com o .order('id') da paginação.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_simulado_respostas_questao
  ON public.simulado_respostas_objetivas (questao_id, id);

-- 2) Composto questão+sessão: junções e agregações que cruzam as duas colunas.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_simulado_respostas_questao_sessao
  ON public.simulado_respostas_objetivas (questao_id, sessao_id);

-- (sessao_id já é indexado por idx_respostas_sessao — não recriar.)
