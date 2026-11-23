-- Nome de exibição da aula (grupo) no conjunto de conteúdo. A chave `aula` ("01") continua
-- sendo a chave de casamento; `titulo_aula` é só o rótulo (ex.: "PNMA"). Aditiva e idempotente.
ALTER TABLE public.simulado_cronograma_conjunto_aulas
  ADD COLUMN IF NOT EXISTS titulo_aula text;

NOTIFY pgrst, 'reload schema';
