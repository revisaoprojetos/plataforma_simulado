-- OTIMIZAÇÕES DE BANCO H2b — idempotente, SEM CONCURRENTLY (roda em transação no SQL Editor do Supabase). NÃO aplicar sem revisão.
--
-- O que faz:
--   1) cron_adapt_espelhar_grade: o ON CONFLICT DO UPDATE só regrava linhas que MUDARAM (evita ~5,8M updates / tuplas mortas em plano_meta),
--      o UPDATE de arquivamento em ..._meta só toca linhas cujo valor muda, + SET statement_timeout = '30s'. Mesma assinatura/retorno/ownership/grants.
--      A função é gerada conforme as colunas existentes: COM snapshot (doc_titulo*, migração 20261125020000) ou SEM (estado atual de produção).
--   2) Índices: plano_meta (tenant_id, tipo, data_prevista) [filtro tipo='lp'/'pf'/'pp' em lib/admin/revisao/relatorios.ts];
--      simulado_leitura_respostas (documento_id, id) [.in('documento_id').order('id') paginado].
--   3) (comentado) DROP de índices sem uso/duplicados.
--   4) statement_timeout em RPCs de relatório/leitura sem teto (proconfig NULL em produção).
--   5) Autovacuum/analyze mais agressivo em simulado_estudantes e plano_meta.
--
-- ATENÇÃO — LOCKS: CREATE INDEX (sem CONCURRENTLY) BLOQUEIA ESCRITA na tabela enquanto cria. leitura_respostas ≈ 213k linhas/102 MB (segundos);
--   plano_meta ≈ 1,5M linhas (alguns segundos a ~20 s). Rode fora do pico. CREATE OR REPLACE FUNCTION / ALTER FUNCTION / ALTER TABLE SET (autovacuum)
--   são instantâneos (lock breve, não bloqueiam leitura/escrita).
--   NÃO incluí índice em simulado_audit_logs (tenant_id, criado_em DESC): a tabela tem ~1,2 GB e o índice já está definido (com CONCURRENTLY, mesmo nome
--   ix_simulado_audit_logs_tenant_criado) em 20261124000000_audit_logs_indices_listagem.sql — que AINDA NÃO está aplicada em produção. Aplicar aquele, 1 comando por vez.
--
-- COMO APLICAR: colar o arquivo inteiro no SQL Editor do Supabase e executar (uma transação). Ordem: indiferente em relação a 20261125020000
--   (a função se adapta); porém se 20261125020000 for aplicada DEPOIS desta, ela recria a função ANTIGA (sem otimização/timeout) → reexecute o bloco (1) desta migração.
-- COMO REVERTER:
--   - Função: reaplicar a definição de 20261125020000 (ou 20261110020000 se as colunas doc_titulo não existirem) — volta ao UPDATE incondicional e sem timeout.
--   - Índices: DROP INDEX IF EXISTS public.ix_cron_adapt_pm_tenant_tipo_data; DROP INDEX IF EXISTS public.ix_leitura_respostas_documento_id;
--   - Timeouts: ALTER FUNCTION <assinatura> RESET statement_timeout;
--   - Autovacuum: ALTER TABLE public.simulado_estudantes RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor); idem plano_meta.
-- COMO CONFERIR DEPOIS:
--   SELECT proconfig FROM pg_proc WHERE proname='cron_adapt_espelhar_grade';                        -- {statement_timeout=30s}
--   SELECT n_tup_upd, n_tup_hot_upd, n_dead_tup FROM pg_stat_user_tables WHERE relname='simulado_cronograma_adaptativo_plano_meta'; -- n_tup_upd cresce bem menos
--   SELECT indexrelname, idx_scan FROM pg_stat_user_indexes WHERE indexrelname IN ('ix_cron_adapt_pm_tenant_tipo_data','ix_leitura_respostas_documento_id');
--   SELECT relname, reloptions FROM pg_class WHERE relname IN ('simulado_estudantes','simulado_cronograma_adaptativo_plano_meta');
--   (mecanismo) chamada repetida com a MESMA grade deve retornar n = 0 linhas alteradas (antes retornava o total).

-- =====================================================================================================================
-- (1) cron_adapt_espelhar_grade — só regrava o que mudou
--     Observação: linhas inalteradas deixam de ter atualizado_em renovado (o app não lê atualizado_em de plano_meta). O retorno (integer) passa a ser
--     "linhas inseridas + realmente alteradas" (o app não usa o valor).
-- =====================================================================================================================
DO $mig$
DECLARE
  v_snap boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'simulado_cronograma_adaptativo_plano_meta' AND column_name = 'doc_titulo_norm'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'simulado_cronograma_adaptativo_plano_meta' AND column_name = 'doc_pasta_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'simulado_cronograma_adaptativo_plano_meta' AND column_name = 'doc_titulo'
  ) INTO v_snap;

  IF v_snap THEN
    -- variante COM snapshot de documento (20261125020000 aplicada)
    EXECUTE $q$
CREATE OR REPLACE FUNCTION public.cron_adapt_espelhar_grade(p_plano uuid, p_linhas jsonb) RETURNS integer
LANGUAGE plpgsql
SET statement_timeout = '30s'
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
   -- só regrava se algo mudou (comparando o valor FINAL de cada coluna, inclusive o COALESCE do snapshot)
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
END $fn$
$q$;
  ELSE
    -- variante SEM snapshot (estado atual de produção: 20261125020000 ainda não aplicada)
    EXECUTE $q$
CREATE OR REPLACE FUNCTION public.cron_adapt_espelhar_grade(p_plano uuid, p_linhas jsonb) RETURNS integer
LANGUAGE plpgsql
SET statement_timeout = '30s'
AS $fn$
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
         ordem = EXCLUDED.ordem, detalhes = EXCLUDED.detalhes, semana_origem = EXCLUDED.semana_origem, atualizado_em = now()
   -- só regrava se algo mudou
   WHERE (pm.tipo, pm.tipo_nome, pm.parte, pm.disciplina, pm.aula, pm.titulo, pm.documento_id, pm.aula_key,
          pm.semana, pm.dia, pm.data_prevista, pm.horas, pm.ordem, pm.detalhes, pm.semana_origem)
         IS DISTINCT FROM
         (EXCLUDED.tipo, EXCLUDED.tipo_nome, EXCLUDED.parte, EXCLUDED.disciplina, EXCLUDED.aula, EXCLUDED.titulo, EXCLUDED.documento_id, EXCLUDED.aula_key,
          EXCLUDED.semana, EXCLUDED.dia, EXCLUDED.data_prevista, EXCLUDED.horas, EXCLUDED.ordem, EXCLUDED.detalhes, EXCLUDED.semana_origem);
  GET DIAGNOSTICS n = ROW_COUNT;
  -- progresso de metas que saíram vira arquivado; o que voltou, volta a ativo (só toca linhas cujo estado muda)
  UPDATE public.simulado_cronograma_adaptativo_meta m
     SET arquivada = NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id),
         arquivada_em = CASE WHEN NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id) THEN COALESCE(m.arquivada_em, now()) ELSE NULL END
   WHERE m.plano_id = p_plano
     AND (m.arquivada IS DISTINCT FROM NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id)
          OR (m.arquivada = false AND m.arquivada_em IS NOT NULL) OR (m.arquivada = true AND m.arquivada_em IS NULL));
  RETURN n;
END $fn$
$q$;
  END IF;
END $mig$;

-- mesmas permissões de antes (CREATE OR REPLACE preserva, reafirmado por segurança)
REVOKE ALL ON FUNCTION public.cron_adapt_espelhar_grade(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_adapt_espelhar_grade(uuid, jsonb) TO service_role;

-- =====================================================================================================================
-- (2) ÍNDICES (verificado em produção em 25/11/2026 — pg_indexes — para NÃO duplicar)
--   plano_meta já tinha: (tenant,estudante), (tenant,estudante,data), (tenant,aula_key) parcial, (documento_id) parcial, (tenant,meta_id),
--     (tenant,plano,data,ordem), (plano,meta_id), (tenant,ref_aula) parcial, (tenant,plano,semana_origem) parcial, (tenant,data) + UNIQUE(plano,meta_id).
--     NENHUM cobre tipo → o filtro pm.tipo IN ('pf','pp') / = 'lp' + data_prevista BETWEEN (relatorios.ts) hoje lê todas as linhas do tenant no período
--     e filtra (tipo='lp' ≈ 43% da tabela). Índice abaixo permite range direto.
--   leitura_respostas já tinha: (questao_id), (estudante_id, documento_id), UNIQUE(estudante_id, documento_id, questao_id). Nenhum começa por documento_id;
--     consultas por .in('documento_id', chunk).order('id') (engajamento-leitura, lib/leitura/*) sem estudante_id (ex.: engajamento-leitura.ts:86) fazem seq scan + sort.
--   simulado_audit_logs: (tenant_id, criado_em DESC) NÃO existe em produção → ver 20261124000000 (CONCURRENTLY, tabela 1,2 GB). Intencionalmente fora daqui.
-- =====================================================================================================================
CREATE INDEX IF NOT EXISTS ix_cron_adapt_pm_tenant_tipo_data
  ON public.simulado_cronograma_adaptativo_plano_meta (tenant_id, tipo, data_prevista);

CREATE INDEX IF NOT EXISTS ix_leitura_respostas_documento_id
  ON public.simulado_leitura_respostas (documento_id, id);

-- =====================================================================================================================
-- (3) OPCIONAL (descomente após conferir idx_scan em pg_stat_user_indexes; stats podem ter sido zeradas num restart/reset)
-- =====================================================================================================================
-- Sem uso (0 scans, 25 MB) — decisão do usuário:
-- DROP INDEX IF EXISTS public.idx_simulado_respostas_questao;
--
-- Duplicado EXATO da UNIQUE (plano_id, meta_id) (criado em 20261201000000 sem necessidade; custo em todo UPDATE/INSERT de plano_meta):
-- DROP INDEX IF EXISTS public.idx_cron_adapt_pm_plano_meta;
--
-- Com 0 scans em plano_meta (ainda não usados por nenhuma consulta observada; avaliar antes): idx_cron_adapt_pm_aluno_data (e idx_cron_adapt_pm_aluno,
-- 2 scans, é prefixo dele), idx_cron_adapt_pm_aula_key, idx_cron_adapt_pm_semana_origem:
-- DROP INDEX IF EXISTS public.idx_cron_adapt_pm_aluno_data;
-- DROP INDEX IF EXISTS public.idx_cron_adapt_pm_aula_key;
-- DROP INDEX IF EXISTS public.idx_cron_adapt_pm_semana_origem;

-- =====================================================================================================================
-- (4) statement_timeout em funções pesadas sem teto (pg_proc.proconfig = NULL em produção). an_resumo já tem 45s (20261201000000).
--     Só funções de LEITURA/relatório; funções mutantes (recalcular_notas_simulado etc.) ficam de fora de propósito.
--     Se estourar o teto o chamador recebe erro 57014 (o app já trata RPC com erro como indisponível). Ajuste os valores se necessário.
--     Obs.: ALTER FUNCTION ... SET substitui o proconfig inteiro? NÃO — adiciona/atualiza só esta chave (search_path existente é mantido).
-- =====================================================================================================================
DO $to$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('public.rpc_leitura_ranking(uuid,uuid[],text)',            '60s'),
      ('public.rpc_leitura_ranking_json(uuid,uuid[],text)',       '60s'),
      ('public.rpc_leitura_relatorio_json(uuid,uuid[],text)',     '60s'),
      ('public.rpc_juris_relatorio_json(uuid,uuid,text[],jsonb)', '60s'),
      ('public.rpc_controle_acesso_json(uuid,uuid)',              '30s'),
      ('public.rpc_grupos_por_aluno(uuid)',                       '30s'),
      ('public.rpc_nps_resumo(uuid)',                             '30s'),
      ('public.auditoria_problemas_resumo(uuid,date)',            '60s'),
      ('public.get_area_scores(uuid)',                            '30s')
    ) AS t(assinatura, teto)
  LOOP
    -- to_regprocedure devolve NULL se a assinatura não existir (ex.: get_area_scores com outra assinatura) → pula sem erro
    IF to_regprocedure(r.assinatura) IS NOT NULL THEN
      EXECUTE format('ALTER FUNCTION %s SET statement_timeout = %L', r.assinatura, r.teto);
    ELSE
      RAISE NOTICE 'pulado (assinatura não encontrada): %', r.assinatura;
    END IF;
  END LOOP;
END $to$;

-- =====================================================================================================================
-- (5) Autovacuum/analyze mais agressivo (padrão é 20% / 10%): tabelas muito atualizadas. Não bloqueia leitura/escrita (lock breve).
--     Efeito: vacuum dispara com 2% de tuplas mortas (≈ 580 linhas em simulado_estudantes, ≈ 30k em plano_meta).
-- =====================================================================================================================
ALTER TABLE public.simulado_estudantes
  SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta
  SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.02);

NOTIFY pgrst, 'reload schema';
