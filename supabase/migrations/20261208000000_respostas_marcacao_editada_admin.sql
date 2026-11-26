-- Edição ADMIN da marcação do aluno numa sessão finalizada, PRESERVANDO a marcação original.
-- As colunas só são preenchidas na PRIMEIRA edição (edições seguintes mantêm a original).
--   marcacao_editada                  true = a resposta atual foi alterada por um admin
--   marcacao_original_alternativa_id  alternativa que o ALUNO marcou (NULL + marcacao_editada = estava em branco)
--   editada_por / editada_em / editada_motivo  última edição (quem, quando, por quê)
-- Idempotente, sem CONCURRENTLY.

ALTER TABLE public.simulado_respostas_objetivas
  ADD COLUMN IF NOT EXISTS marcacao_original_alternativa_id uuid NULL,
  ADD COLUMN IF NOT EXISTS marcacao_editada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS editada_por uuid NULL,
  ADD COLUMN IF NOT EXISTS editada_em timestamptz NULL,
  ADD COLUMN IF NOT EXISTS editada_motivo text NULL;

-- Auditoria/consulta rápida das respostas editadas (índice parcial, minúsculo).
CREATE INDEX IF NOT EXISTS idx_resp_obj_marcacao_editada
  ON public.simulado_respostas_objetivas (sessao_id)
  WHERE marcacao_editada;

NOTIFY pgrst, 'reload schema';
