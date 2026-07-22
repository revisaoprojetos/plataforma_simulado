-- Fase 0.2 do roadmap de arquitetura: índices que faltam para relatórios e re-correção.
--
-- A tabela simulado_respostas_objetivas só tem índice em (sessao_id) — vindo do motor
-- 20260626000002. As queries de RELATÓRIO DE TURMA e de RE-CORREÇÃO filtram por
-- questao_id (`.in('questao_id', ...)` em estudantes/_dados.ts, disciplinas/_dados.ts,
-- ranking/_dados.ts e no fluxo de re-correção), o que hoje faz SEQ SCAN na tabela
-- inteira. Com dezenas de milhares de respostas isso é um dos maiores gargalos.
--
-- ⚠️ Sem CONCURRENTLY: o SQL Editor do Supabase roda tudo em transação, e
--    CREATE INDEX CONCURRENTLY não pode rodar em transação (erro 25001). O CREATE INDEX
--    normal trava ESCRITAS na tabela por alguns segundos durante a construção — então
--    rode quando NÃO houver simulado em andamento (fora de janela / ninguém respondendo).
--    (Se quiser zero-lock, rode via psql direto — aí dá pra usar CONCURRENTLY.)
--
-- Auditoria do estado atual (opcional, para conferir o que já existe):
--   SELECT indexname, indexdef FROM pg_indexes
--   WHERE tablename = 'simulado_respostas_objetivas' ORDER BY indexname;

-- 1) Filtro por questão (turma × aluno, re-correção). Inclui id p/ casar com o .order('id') da paginação.
CREATE INDEX IF NOT EXISTS idx_simulado_respostas_questao
  ON public.simulado_respostas_objetivas (questao_id, id);

-- 2) Composto questão+sessão: junções e agregações que cruzam as duas colunas.
CREATE INDEX IF NOT EXISTS idx_simulado_respostas_questao_sessao
  ON public.simulado_respostas_objetivas (questao_id, sessao_id);

-- (sessao_id já é indexado por idx_respostas_sessao — não recriar.)
