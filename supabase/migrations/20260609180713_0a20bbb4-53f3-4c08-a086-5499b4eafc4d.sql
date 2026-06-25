-- Unique parcial em codigo_externo (permite múltiplos NULL)
DROP INDEX IF EXISTS questoes_codigo_externo_key;
CREATE UNIQUE INDEX IF NOT EXISTS questoes_codigo_externo_key
  ON public.questoes (codigo_externo)
  WHERE codigo_externo IS NOT NULL;

-- Índice para buscas/filtros por assunto
CREATE INDEX IF NOT EXISTS idx_questoes_assunto ON public.questoes (assunto);
