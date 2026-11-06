-- Fase 1 (cronograma adaptativo): CHAVE ESTÁVEL da aula, independente da posição (pf:<i>).
-- A posição muda quando a Biblioteca ganha/renomeia/reordena documentos; a chave (d:<docId> · t:disciplina|tema) não.
-- Aditiva e idempotente. O app é tolerante: sem esta migração o espelho grava sem `aula_key`.
-- Os planos ganham a chave no próximo espelhamento (o hash do espelho ganhou a versão 'k1').

-- 0) BACKUP do progresso do aluno (snapshot imutável antes de qualquer mudança desta frente)
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_meta_bkp_20261106 AS
  SELECT * FROM public.simulado_cronograma_adaptativo_meta;
ALTER TABLE public.simulado_cronograma_adaptativo_meta_bkp_20261106 ENABLE ROW LEVEL SECURITY; -- sem policy: só service_role

-- 1) coluna + índice
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta ADD COLUMN IF NOT EXISTS aula_key text;
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_aula_key
  ON public.simulado_cronograma_adaptativo_plano_meta (tenant_id, aula_key) WHERE aula_key IS NOT NULL;

ALTER TABLE public.simulado_cronograma_adaptativo_meta_def ADD COLUMN IF NOT EXISTS aula_key text;
CREATE INDEX IF NOT EXISTS idx_cron_adapt_def_aula_key
  ON public.simulado_cronograma_adaptativo_meta_def (tenant_id, aula_key) WHERE aula_key IS NOT NULL;

-- 2) backfill parcial: onde já há documento da Biblioteca, a chave é d:<documento_id>
UPDATE public.simulado_cronograma_adaptativo_plano_meta
   SET aula_key = 'd:' || documento_id::text
 WHERE aula_key IS NULL AND documento_id IS NOT NULL AND tipo IN ('pf','pp','fl','qu','rf','rq');
-- em meta_def a `chave` da aula JÁ é a chave estável (d:<doc> · t:disc|tema) → aula_key = chave
UPDATE public.simulado_cronograma_adaptativo_meta_def
   SET aula_key = chave
 WHERE aula_key IS NULL AND tipo = 'aula';

NOTIFY pgrst, 'reload schema';
