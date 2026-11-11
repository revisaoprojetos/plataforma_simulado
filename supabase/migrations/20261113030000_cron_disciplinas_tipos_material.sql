-- Cronograma Adaptativo (admin Plataforma Revisão) — liga/desliga PDFull, Jurisprudência e LegProc POR DISCIPLINA.
-- Idempotente. Default true = comportamento atual (nada muda até o admin desligar).
--   pdfull   → disciplina sem PDFull no gerador (não entra no rodízio de leitura; metas derivadas dela também não nascem)
--   legproc  → disciplina sem metas de LegProc
--   juris    → pasta de Jurisprudência de mesmo nome sai da meta semanal de Jurisprudência
ALTER TABLE public.simulado_revisao_cron_disciplinas ADD COLUMN IF NOT EXISTS pdfull  boolean NOT NULL DEFAULT true;
ALTER TABLE public.simulado_revisao_cron_disciplinas ADD COLUMN IF NOT EXISTS legproc boolean NOT NULL DEFAULT true;
ALTER TABLE public.simulado_revisao_cron_disciplinas ADD COLUMN IF NOT EXISTS juris   boolean NOT NULL DEFAULT true;
