-- CRONOGRAMA ADAPTATIVO — persistência dos DETALHES por meta, data real de conclusão e certeza (cert) das questões.
--
-- O motor atual precisa, ao recalcular NO SERVIDOR, do que hoje só existe no iframe: detalhes da meta (pai, origem, material,
-- percentualOrigem, ordemAlternancia, semanaOrigemRevisao, essencialNaoSelecionada, páginas…), a data REAL de conclusão e o `cert`
-- (acertos) das anotações de questões. Aditiva e idempotente; nada é apagado e planos antigos continuam válidos (colunas anuláveis).
-- Pré-requisitos: 20261105050000 (plano_meta), 20261106040000 (função de espelho). Aplicação manual no SQL Editor.

-- 1) PLANO: mapa { meta_id: detalhe } do plano inteiro (fonte lida pelo motor ao recalcular)
ALTER TABLE public.simulado_cronograma_adaptativo_plano
  ADD COLUMN IF NOT EXISTS detalhes_metas jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 2) PLANO_META (definição da meta, em linhas): detalhes + semana de origem promovida (pf|fl:i:revisao:s, rf:s:i, qu:i:hist:s, jp:s…)
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta ADD COLUMN IF NOT EXISTS detalhes jsonb;
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta ADD COLUMN IF NOT EXISTS semana_origem integer;
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_semana_origem
  ON public.simulado_cronograma_adaptativo_plano_meta (tenant_id, plano_id, semana_origem) WHERE semana_origem IS NOT NULL;

-- backfill da semana de origem a partir do próprio meta_id (idempotente: só onde ainda é nula)
UPDATE public.simulado_cronograma_adaptativo_plano_meta
   SET semana_origem = CASE
         WHEN meta_id ~ '^(pf|fl):\d+:(revisao|reforco):\d+$' THEN split_part(meta_id, ':', 4)::integer
         WHEN meta_id ~ '^qu:\d+:hist:\d+$'                   THEN split_part(meta_id, ':', 4)::integer
         WHEN meta_id ~ '^(rf|rq|jp):\d+(:\d+)?$'             THEN split_part(meta_id, ':', 2)::integer
       END
 WHERE semana_origem IS NULL
   AND (meta_id ~ '^(pf|fl):\d+:(revisao|reforco):\d+$' OR meta_id ~ '^qu:\d+:hist:\d+$' OR meta_id ~ '^(rf|rq|jp):\d+(:\d+)?$');

-- 3) META (progresso do aluno): data real de conclusão e certeza (acertos) das questões
ALTER TABLE public.simulado_cronograma_adaptativo_meta ADD COLUMN IF NOT EXISTS concluido_em date;
ALTER TABLE public.simulado_cronograma_adaptativo_meta ADD COLUMN IF NOT EXISTS cert integer;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_cron_adapt_meta_cert') THEN
    ALTER TABLE public.simulado_cronograma_adaptativo_meta ADD CONSTRAINT chk_cron_adapt_meta_cert CHECK (cert IS NULL OR cert >= 0) NOT VALID;
  END IF;
END $$;
-- conclusões já gravadas: a melhor aproximação é o dia da última atualização (o iframe passa a enviar a data real)
UPDATE public.simulado_cronograma_adaptativo_meta
   SET concluido_em = (atualizado_em AT TIME ZONE 'America/Fortaleza')::date
 WHERE estado = 'done' AND concluido_em IS NULL;

-- 4) CHECK de tipos: o prefixo continua sendo um de pf|pp|fl|qu|lp|rf|rq|jp (pf|fl:i:revisao:s, qu:i:hist:s, pf|fl:i:reforco:s e jp:s usam
--    os mesmos prefixos). Reafirmado aqui de forma idempotente por segurança.
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta DROP CONSTRAINT IF EXISTS chk_cron_adapt_pm_tipo;
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta
  ADD CONSTRAINT chk_cron_adapt_pm_tipo CHECK (tipo IN ('pf','pp','fl','qu','lp','rf','rq','jp')) NOT VALID;

-- 5) Espelho transacional: passa a gravar detalhes + semana_origem (RLS/ownership iguais aos da função anterior)
CREATE OR REPLACE FUNCTION public.cron_adapt_espelhar_grade(p_plano uuid, p_linhas jsonb) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.simulado_cronograma_adaptativo_plano_meta pm
   WHERE pm.plano_id = p_plano
     AND pm.meta_id NOT IN (SELECT r.meta_id FROM jsonb_to_recordset(p_linhas) AS r(meta_id text));
  INSERT INTO public.simulado_cronograma_adaptativo_plano_meta AS pm
        (tenant_id, estudante_id, plano_id, meta_id, tipo, tipo_nome, parte, disciplina, aula, titulo, documento_id, aula_key,
         semana, dia, data_prevista, horas, ordem, detalhes, semana_origem, atualizado_em)
  SELECT r.tenant_id, r.estudante_id, p_plano, r.meta_id, r.tipo, r.tipo_nome, r.parte, r.disciplina, r.aula, r.titulo, r.documento_id, r.aula_key,
         r.semana, r.dia, r.data_prevista, r.horas, r.ordem, r.detalhes, r.semana_origem, now()
    FROM jsonb_to_recordset(p_linhas) AS r(tenant_id uuid, estudante_id uuid, meta_id text, tipo text, tipo_nome text, parte integer,
         disciplina text, aula text, titulo text, documento_id uuid, aula_key text, semana integer, dia integer,
         data_prevista date, horas numeric, ordem integer, detalhes jsonb, semana_origem integer)
  ON CONFLICT (plano_id, meta_id) DO UPDATE SET
         tipo = EXCLUDED.tipo, tipo_nome = EXCLUDED.tipo_nome, parte = EXCLUDED.parte, disciplina = EXCLUDED.disciplina,
         aula = EXCLUDED.aula, titulo = EXCLUDED.titulo, documento_id = EXCLUDED.documento_id, aula_key = EXCLUDED.aula_key,
         semana = EXCLUDED.semana, dia = EXCLUDED.dia, data_prevista = EXCLUDED.data_prevista, horas = EXCLUDED.horas,
         ordem = EXCLUDED.ordem, detalhes = EXCLUDED.detalhes, semana_origem = EXCLUDED.semana_origem, atualizado_em = now();
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

COMMENT ON COLUMN public.simulado_cronograma_adaptativo_plano.detalhes_metas IS 'Mapa { meta_id: detalhe } do plano (pai, origem, material, ordemAlternancia, semanaOrigemRevisao, essencialNaoSelecionada…) — entrada do motor ao recalcular.';
COMMENT ON COLUMN public.simulado_cronograma_adaptativo_plano_meta.detalhes IS 'Detalhes da meta (jsonb) espelhados de plano.detalhes_metas.';
COMMENT ON COLUMN public.simulado_cronograma_adaptativo_plano_meta.semana_origem IS 'Semana de origem da meta de revisão/reforço/diagnóstico/jurisprudência (pf|fl:i:revisao:s, rf:s:i, qu:i:hist:s, jp:s).';
COMMENT ON COLUMN public.simulado_cronograma_adaptativo_meta.concluido_em IS 'Data REAL de conclusão da meta (não a planejada).';
COMMENT ON COLUMN public.simulado_cronograma_adaptativo_meta.cert IS 'Acertos nas questões da anotação (res − err); alimenta o resultado do tema na revisão adaptativa.';

INSERT INTO public.simulado_cronograma_adaptativo_schema (versao) VALUES ('20261110020000') ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
