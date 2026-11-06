-- Fase 3 (cronograma adaptativo): INTEGRIDADE do banco. Aditiva e idempotente; não apaga nem altera dados existentes.
-- Requer 20261106030000 (aula_key). O app é tolerante: sem esta migração usa os caminhos antigos.

-- 1) Índices por plano_id nas filhas sem PK por plano_id (acelera o ON DELETE CASCADE e as leituras)
CREATE INDEX IF NOT EXISTS idx_cron_adapt_rotina_plano  ON public.simulado_cronograma_adaptativo_plano_rotina  (plano_id);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_recesso_plano ON public.simulado_cronograma_adaptativo_plano_recesso (plano_id);

-- 2) Controle de concorrência otimista do plano (o app passa a gravar com UPDATE ... WHERE versao = <lida>)
ALTER TABLE public.simulado_cronograma_adaptativo_plano ADD COLUMN IF NOT EXISTS versao integer NOT NULL DEFAULT 1;

-- 3) Progresso: meta que saiu da grade vira ARQUIVADA (nunca apagada) + índice por aluno
ALTER TABLE public.simulado_cronograma_adaptativo_meta
  ADD COLUMN IF NOT EXISTS arquivada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS arquivada_em timestamptz;
CREATE INDEX IF NOT EXISTS idx_cron_adapt_meta_estudante ON public.simulado_cronograma_adaptativo_meta (tenant_id, estudante_id);

-- 4) Tipo de meta restrito (NOT VALID: não varre as 434 mil linhas agora; vale para novas gravações)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cron_adapt_pm_tipo') THEN
    ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta
      ADD CONSTRAINT chk_cron_adapt_pm_tipo CHECK (tipo IN ('pf','pp','fl','qu','lp','rf','rq')) NOT VALID;
  END IF;
END $$;

-- 5) tenant_id do filho tem de ser o do plano (isolamento por tenant mesmo com service role)
CREATE OR REPLACE FUNCTION public.cron_adapt_tenant_igual_plano() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id IS DISTINCT FROM (SELECT p.tenant_id FROM public.simulado_cronograma_adaptativo_plano p WHERE p.id = NEW.plano_id) THEN
    RAISE EXCEPTION 'tenant_id (%) diverge do plano %', NEW.tenant_id, NEW.plano_id USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['meta','plano_rotina','plano_recesso','plano_extra','plano_hora_pontual','plano_sobra','plano_remanejada'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_tenant_plano ON public.simulado_cronograma_adaptativo_%s', t);
    EXECUTE format('CREATE TRIGGER trg_tenant_plano BEFORE INSERT OR UPDATE OF tenant_id, plano_id ON public.simulado_cronograma_adaptativo_%s FOR EACH ROW EXECUTE FUNCTION public.cron_adapt_tenant_igual_plano()', t);
  END LOOP;
END $$;

-- 6) Relatório de ÓRFÃOS: progresso cuja meta não está mais na grade espelhada (só planos já espelhados)
CREATE OR REPLACE VIEW public.simulado_cronograma_adaptativo_meta_orfas AS
SELECT m.*
  FROM public.simulado_cronograma_adaptativo_meta m
 WHERE EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id)
   AND NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id);
ALTER VIEW public.simulado_cronograma_adaptativo_meta_orfas SET (security_invoker = true);
REVOKE ALL ON public.simulado_cronograma_adaptativo_meta_orfas FROM anon, authenticated;

-- 7) Marca como ARQUIVADO (sem apagar) o progresso órfão atual
UPDATE public.simulado_cronograma_adaptativo_meta m
   SET arquivada = true, arquivada_em = now()
  FROM public.simulado_cronograma_adaptativo_meta_orfas o
 WHERE o.id = m.id AND m.arquivada = false;

-- 8) ESPELHO TRANSACIONAL: apaga o que saiu da grade e grava o resto numa transação só (ou tudo, ou nada)
CREATE OR REPLACE FUNCTION public.cron_adapt_espelhar_grade(p_plano uuid, p_linhas jsonb) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.simulado_cronograma_adaptativo_plano_meta pm
   WHERE pm.plano_id = p_plano
     AND pm.meta_id NOT IN (SELECT r.meta_id FROM jsonb_to_recordset(p_linhas) AS r(meta_id text));
  INSERT INTO public.simulado_cronograma_adaptativo_plano_meta AS pm
        (tenant_id, estudante_id, plano_id, meta_id, tipo, tipo_nome, parte, disciplina, aula, titulo, documento_id, aula_key,
         semana, dia, data_prevista, horas, ordem, atualizado_em)
  SELECT r.tenant_id, r.estudante_id, p_plano, r.meta_id, r.tipo, r.tipo_nome, r.parte, r.disciplina, r.aula, r.titulo, r.documento_id, r.aula_key,
         r.semana, r.dia, r.data_prevista, r.horas, r.ordem, now()
    FROM jsonb_to_recordset(p_linhas) AS r(tenant_id uuid, estudante_id uuid, meta_id text, tipo text, tipo_nome text, parte integer,
         disciplina text, aula text, titulo text, documento_id uuid, aula_key text, semana integer, dia integer,
         data_prevista date, horas numeric, ordem integer)
  ON CONFLICT (plano_id, meta_id) DO UPDATE SET
         tipo = EXCLUDED.tipo, tipo_nome = EXCLUDED.tipo_nome, parte = EXCLUDED.parte, disciplina = EXCLUDED.disciplina,
         aula = EXCLUDED.aula, titulo = EXCLUDED.titulo, documento_id = EXCLUDED.documento_id, aula_key = EXCLUDED.aula_key,
         semana = EXCLUDED.semana, dia = EXCLUDED.dia, data_prevista = EXCLUDED.data_prevista, horas = EXCLUDED.horas,
         ordem = EXCLUDED.ordem, atualizado_em = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  -- progresso de metas que saíram vira arquivado; o que voltou, volta a ativo
  UPDATE public.simulado_cronograma_adaptativo_meta m
     SET arquivada = NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id),
         arquivada_em = CASE WHEN NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id) THEN COALESCE(m.arquivada_em, now()) ELSE NULL END
   WHERE m.plano_id = p_plano;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.cron_adapt_espelhar_grade(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_adapt_espelhar_grade(uuid, jsonb) TO service_role;

-- 9) Controle de versão do esquema do Adaptativo (saber o que foi aplicado, em vez de depender de tolerância do código)
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_schema (
  versao text PRIMARY KEY, aplicada_em timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.simulado_cronograma_adaptativo_schema ENABLE ROW LEVEL SECURITY; -- sem policy: só service_role
INSERT INTO public.simulado_cronograma_adaptativo_schema (versao) VALUES
  ('20261105050000'), ('20261105060000'), ('20261105061000'), ('20261105070000'), ('20261105080000'),
  ('20261106030000'), ('20261106040000')
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
