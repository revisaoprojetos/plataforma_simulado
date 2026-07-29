-- Índice de performance para re-correção e estatísticas por questão (Fase 0 do roadmap
-- de arquitetura). A tabela simulado_respostas_objetivas (~80k linhas e crescendo) só tem
-- índices que LIDERAM por sessao_id (idx_respostas_sessao + a UNIQUE(sessao_id,questao_id)),
-- então NENHUM serve consultas que filtram/juntam por questao_id primeiro:
--   • re-correção varre TODAS as respostas de UMA questão (anulação/troca de alternativa);
--   • estatística "quem errou a questão X" / acerto por questão.
-- Sem este índice, essas operações fazem seq scan da tabela inteira.
--
-- O composto (questao_id, sessao_id) lidera por questao_id (serve os filtros acima) E cobre
-- a junção questao_id+sessao_id da re-correção — um único índice, mínimo overhead de escrita
-- na tabela quente (auto-save durante a prova).
--
-- ⚠️ CONCURRENTLY não trava a tabela quente, MAS não pode rodar dentro de transação.
-- No SQL Editor do Supabase, rode este statement SOZINHO (sem BEGIN/COMMIT em volta).
-- IF NOT EXISTS = idempotente. Se já houver índice equivalente com outro nome, confira antes:
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'simulado_respostas_objetivas';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_simulado_respostas_questao_sessao
  ON public.simulado_respostas_objetivas (questao_id, sessao_id);
