-- =====================================================================================================================
-- 07-funcao-espelhar-grade-FINAL — versão final de cron_adapt_espelhar_grade = campos de 20261125020000 + diff IS DISTINCT/statement_timeout de 20261203000001
-- Projeto alvo: twdrtlxkjvunkdobudev (SQL Editor do Supabase). Cole numa ABA NOVA e rode inteiro (o Editor já usa transação).
-- Idempotente. Sem CONCURRENTLY/VACUUM. Risco: BAIXO (CREATE OR REPLACE; rodar DEPOIS do 06, exige as colunas doc_*)
-- Ver LEIAME.md (ordem, verificação).
-- =====================================================================================================================
SET LOCAL lock_timeout = '15s';

CREATE OR REPLACE FUNCTION public.cron_adapt_espelhar_grade(p_plano uuid, p_linhas jsonb) RETURNS integer
LANGUAGE plpgsql
SET statement_timeout TO '30s'
AS $fn$
DECLARE n integer;
BEGIN
  DELETE FROM public.simulado_cronograma_adaptativo_plano_meta pm
   WHERE pm.plano_id = p_plano
     AND pm.meta_id NOT IN (SELECT r.meta_id FROM jsonb_to_recordset(p_linhas) AS r(meta_id text));
  INSERT INTO public.simulado_cronograma_adaptativo_plano_meta AS pm
        (tenant_id, estudante_id, plano_id, meta_id, tipo, tipo_nome, parte, disciplina, aula, titulo, documento_id, aula_key,
         semana, dia, data_prevista, horas, ordem, detalhes, semana_origem, doc_titulo, doc_titulo_norm, doc_pasta_id, atualizado_em)
  SELECT r.tenant_id, r.estudante_id, p_plano, r.meta_id, r.tipo, r.tipo_nome, r.parte, r.disciplina, r.aula, r.titulo, r.documento_id, r.aula_key,
         r.semana, r.dia, r.data_prevista, r.horas, r.ordem, r.detalhes, r.semana_origem, r.doc_titulo, r.doc_titulo_norm, r.doc_pasta_id, now()
    FROM jsonb_to_recordset(p_linhas) AS r(tenant_id uuid, estudante_id uuid, meta_id text, tipo text, tipo_nome text, parte integer,
         disciplina text, aula text, titulo text, documento_id uuid, aula_key text, semana integer, dia integer,
         data_prevista date, horas numeric, ordem integer, detalhes jsonb, semana_origem integer,
         doc_titulo text, doc_titulo_norm text, doc_pasta_id uuid)
  ON CONFLICT (plano_id, meta_id) DO UPDATE SET
         tipo = EXCLUDED.tipo, tipo_nome = EXCLUDED.tipo_nome, parte = EXCLUDED.parte, disciplina = EXCLUDED.disciplina,
         aula = EXCLUDED.aula, titulo = EXCLUDED.titulo, documento_id = EXCLUDED.documento_id, aula_key = EXCLUDED.aula_key,
         semana = EXCLUDED.semana, dia = EXCLUDED.dia, data_prevista = EXCLUDED.data_prevista, horas = EXCLUDED.horas,
         ordem = EXCLUDED.ordem, detalhes = EXCLUDED.detalhes, semana_origem = EXCLUDED.semana_origem,
         -- snapshot: só sobrescreve quando a linha nova traz o nome (documento apagado/purgado NÃO apaga o último nome conhecido)
         doc_titulo = COALESCE(EXCLUDED.doc_titulo, pm.doc_titulo), doc_titulo_norm = COALESCE(EXCLUDED.doc_titulo_norm, pm.doc_titulo_norm),
         doc_pasta_id = COALESCE(EXCLUDED.doc_pasta_id, pm.doc_pasta_id), atualizado_em = now()
   -- só regrava se algo mudou (compara o valor FINAL do snapshot, após o COALESCE)
   WHERE (pm.tipo, pm.tipo_nome, pm.parte, pm.disciplina, pm.aula, pm.titulo, pm.documento_id, pm.aula_key,
          pm.semana, pm.dia, pm.data_prevista, pm.horas, pm.ordem, pm.detalhes, pm.semana_origem,
          pm.doc_titulo, pm.doc_titulo_norm, pm.doc_pasta_id)
         IS DISTINCT FROM
         (EXCLUDED.tipo, EXCLUDED.tipo_nome, EXCLUDED.parte, EXCLUDED.disciplina, EXCLUDED.aula, EXCLUDED.titulo, EXCLUDED.documento_id, EXCLUDED.aula_key,
          EXCLUDED.semana, EXCLUDED.dia, EXCLUDED.data_prevista, EXCLUDED.horas, EXCLUDED.ordem, EXCLUDED.detalhes, EXCLUDED.semana_origem,
          COALESCE(EXCLUDED.doc_titulo, pm.doc_titulo), COALESCE(EXCLUDED.doc_titulo_norm, pm.doc_titulo_norm), COALESCE(EXCLUDED.doc_pasta_id, pm.doc_pasta_id));
  GET DIAGNOSTICS n = ROW_COUNT;
  -- progresso de metas que saíram vira arquivado; o que voltou, volta a ativo (só toca linhas cujo estado muda)
  UPDATE public.simulado_cronograma_adaptativo_meta m
     SET arquivada = NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id),
         arquivada_em = CASE WHEN NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id) THEN COALESCE(m.arquivada_em, now()) ELSE NULL END
   WHERE m.plano_id = p_plano
     AND (m.arquivada IS DISTINCT FROM NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id)
          OR (m.arquivada = false AND m.arquivada_em IS NOT NULL) OR (m.arquivada = true AND m.arquivada_em IS NULL));
  RETURN n;
END $fn$;
REVOKE ALL ON FUNCTION public.cron_adapt_espelhar_grade(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_adapt_espelhar_grade(uuid, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';
