-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA ADAPTATIVO: 1 plano/aluno  →  MÚLTIPLOS planos + FIXAR foco
-- ═══════════════════════════════════════════════════════════════════════════
-- O Painel de Estudos vira o HUB: o aluno pode ter VÁRIOS cronogramas e FIXAR
-- um como foco (as "metas de hoje" e o embed passam a operar sobre o fixado).
-- Mudanças:
--   1. Remove o UNIQUE(tenant_id, estudante_id) (que limitava a 1 plano/aluno).
--   2. Adiciona `fixado` boolean — no máx. 1 fixado por aluno (índice parcial único).
--   3. Backfill: o plano existente (único) de cada aluno vira o fixado dele.
-- A tabela _meta já é por `plano_id` (UNIQUE(plano_id, meta_id)) — nada a mudar lá.

-- 1. Dropar o UNIQUE(tenant_id, estudante_id), seja qual for o nome da constraint.
DO $$
DECLARE cname text;
BEGIN
  SELECT conname INTO cname
    FROM pg_constraint
   WHERE conrelid = 'public.simulado_cronograma_adaptativo_plano'::regclass
     AND contype = 'u'
     AND conkey = (
       SELECT array_agg(attnum ORDER BY attnum)
         FROM pg_attribute
        WHERE attrelid = 'public.simulado_cronograma_adaptativo_plano'::regclass
          AND attname IN ('tenant_id', 'estudante_id')
     );
  IF cname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.simulado_cronograma_adaptativo_plano DROP CONSTRAINT %I', cname);
  END IF;
END $$;

-- 2. Coluna de foco.
ALTER TABLE public.simulado_cronograma_adaptativo_plano
  ADD COLUMN IF NOT EXISTS fixado boolean NOT NULL DEFAULT false;

-- 3. Backfill: o plano existente (não arquivado) de cada aluno passa a ser o fixado.
--    Como o UNIQUE antigo garantia <= 1 plano/aluno, isto marca no máx. 1 por aluno.
UPDATE public.simulado_cronograma_adaptativo_plano
   SET fixado = true
 WHERE NOT arquivada AND fixado = false;

-- 4. No máximo 1 cronograma fixado por aluno.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cron_adapt_plano_fixado
  ON public.simulado_cronograma_adaptativo_plano (tenant_id, estudante_id)
  WHERE fixado;

-- 5. Listagem "Meus cronogramas" por recência (fixado primeiro é feito no loader).
CREATE INDEX IF NOT EXISTS idx_cron_adapt_plano_est_criado
  ON public.simulado_cronograma_adaptativo_plano (tenant_id, estudante_id, criado_em DESC);

NOTIFY pgrst, 'reload schema';
