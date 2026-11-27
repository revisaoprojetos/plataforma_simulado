-- CRONOGRAMA ADAPTATIVO — FASE 2 do catálogo de tipos: metas próprias 'gx' para tipos PERSONALIZADOS (papel 'generico') com gera_meta.
-- Aditiva e idempotente. Aplicar ANTES do deploy (o espelho relacional passa a gravar tipo 'gx'; sem o CHECK ampliado, o upsert falha).
-- Pré-requisitos: 20261110020000 (CHECK anterior) e 20261202000000 (simulado_conteudo_tipos).
-- Revisado: nenhuma outra view/função filtra por lista fechada de tipos de forma a excluir 'gx' indevidamente
-- (20261119030000/20261106030000 filtram só pf|pp|fl|qu|rf|lp para backfill de documento/aula_key, onde 'gx' não deve entrar).

-- 1) CHECK de tipos do espelho (plano_meta): inclui 'gx'
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta DROP CONSTRAINT IF EXISTS chk_cron_adapt_pm_tipo;
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta
  ADD CONSTRAINT chk_cron_adapt_pm_tipo CHECK (tipo IN ('pf','pp','fl','qu','lp','rf','rq','jp','gx')) NOT VALID;

-- 2) Catálogo: flag "gera meta própria" (só vale para papel 'generico'; imposto pela action/loader)
ALTER TABLE public.simulado_conteudo_tipos ADD COLUMN IF NOT EXISTS gera_meta boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.simulado_conteudo_tipos.gera_meta IS 'true = documentos do tipo (papel generico) viram metas próprias (gx:<slug>:<d8>) em planos gerados/regenerados dali em diante.';

INSERT INTO public.simulado_cronograma_adaptativo_schema (versao) VALUES ('20261126010000') ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
