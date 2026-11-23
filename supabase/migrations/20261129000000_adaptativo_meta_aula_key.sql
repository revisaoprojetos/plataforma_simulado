-- PROGRESSO PRESO AO DOCUMENTO (Cronograma Adaptativo): cada linha de progresso guarda a CHAVE ESTÁVEL da aula
-- (d:<uuid do documento> | t:<disc>|<tema> | c:<id>) além do meta_id POSICIONAL (pf:<idx>...). Aditiva e idempotente.
-- O código funciona SEM esta migração (coluna ausente = comportamento antigo). Preenchimento histórico: scripts/_backfill-aula-key.mjs (dry-run por padrão).
ALTER TABLE public.simulado_cronograma_adaptativo_meta ADD COLUMN IF NOT EXISTS aula_key text;

CREATE INDEX IF NOT EXISTS idx_adapt_meta_plano_aula_key
  ON public.simulado_cronograma_adaptativo_meta (plano_id, aula_key)
  WHERE aula_key IS NOT NULL;
