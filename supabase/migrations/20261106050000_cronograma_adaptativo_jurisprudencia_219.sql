-- Cronograma Adaptativo 2.19: meta semanal de Jurisprudência (tipo `jp`, id `jp:<semana>`).
-- Aditiva e idempotente. Só amplia o CHECK de tipos do espelho relacional (plano_meta) para aceitar 'jp'.
-- Não altera nenhum plano existente: o `jp` só aparece quando o tenant liga a regra (params.jurisprudencia219).

ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta DROP CONSTRAINT IF EXISTS chk_cron_adapt_pm_tipo;
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta
  ADD CONSTRAINT chk_cron_adapt_pm_tipo CHECK (tipo IN ('pf','pp','fl','qu','lp','rf','rq','jp')) NOT VALID;

-- registro de esquema (existe se a 20261106040000 já foi aplicada; senão, ignora)
DO $$ BEGIN
  IF to_regclass('public.simulado_cronograma_adaptativo_schema') IS NOT NULL THEN
    INSERT INTO public.simulado_cronograma_adaptativo_schema (versao) VALUES ('20261106050000') ON CONFLICT DO NOTHING;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
