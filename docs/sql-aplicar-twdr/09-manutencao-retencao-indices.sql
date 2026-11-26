-- =====================================================================================================================
-- 09-manutencao-retencao-indices — 5 índices de FK, DROP de índice duplicado, autovacuum, funções purgar_* (origem 20261204000100)
-- Projeto alvo: twdrtlxkjvunkdobudev (SQL Editor do Supabase). Cole numa ABA NOVA e rode inteiro (o Editor já usa transação).
-- Idempotente. Sem CONCURRENTLY/VACUUM. Risco: MÉDIO: índices em simulado_conteudo_trechos (1,19 mi/619 MB) e grifos_pdf (300k/245 MB) bloqueiam escrita por segundos a ~1 min; DROP INDEX/ALTER SET autovacuum pedem lock breve; rode fora do pico
-- Ver LEIAME.md (ordem, verificação).
-- =====================================================================================================================
SET LOCAL lock_timeout = '15s';

-- =====================================================================================================================
-- 20261204000100_manutencao_retencao_indices.sql
-- Manutenção: índices em FKs sem índice, DROP de índice duplicado, autovacuum e FUNÇÕES de retenção (NÃO agendadas, NÃO executadas).
-- Idempotente (IF NOT EXISTS / IF EXISTS). SEM CONCURRENTLY: roda no SQL Editor (transação). Nada aqui apaga dados sozinho.
-- LOCKS: CREATE INDEX (não concorrente) bloqueia ESCRITA na tabela enquanto cria — rode fora do pico. lock_timeout evita ficar
--   preso atrás de transação longa (falha rápido; basta reexecutar). ALTER TABLE ... SET (autovacuum) = lock breve.
-- COMO REVERTER: DROP INDEX IF EXISTS <nome>; ALTER TABLE <t> RESET (autovacuum_vacuum_scale_factor, autovacuum_analyze_scale_factor);
--   DROP FUNCTION public.purgar_*; (o índice idx_cron_adapt_pm_plano_meta é recriável: CREATE INDEX ... (plano_id, meta_id), mas é
--   redundante com a UNIQUE (plano_id, meta_id)).
-- Depois de aplicar: NOTIFY pgrst, 'reload schema';  (funções novas ficam visíveis no PostgREST)
-- =====================================================================================================================
SET LOCAL lock_timeout = '10s';

-- (1) Índices nas FKs sem índice líder (ON DELETE CASCADE do pai varria a filha inteira a cada delete).
--     Colunas CONFIRMADAS no banco (pg_constraint):
--       simulado_conteudo_trechos.uid     -> simulado_conteudo_trecho_identidade(uid) ON DELETE CASCADE   (a UNIQUE existente é (versao_id, uid): uid NÃO é líder)
--       simulado_conteudo_trechos.pai_uid -> simulado_conteudo_trecho_identidade(uid)
--       simulado_conteudo_grifos_pdf.documento_id        (existentes têm tenant_id na frente)
--       simulado_aluno_notebook_paginas.secao_id         (existentes têm estudante_id na frente)
--       simulado_leitura_anotacoes.documento_id          (existentes têm estudante_id na frente)
CREATE INDEX IF NOT EXISTS ix_conteudo_trechos_uid
  ON public.simulado_conteudo_trechos (uid);
CREATE INDEX IF NOT EXISTS ix_conteudo_trechos_pai_uid
  ON public.simulado_conteudo_trechos (pai_uid) WHERE pai_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_conteudo_grifos_pdf_documento
  ON public.simulado_conteudo_grifos_pdf (documento_id);
CREATE INDEX IF NOT EXISTS ix_nb_paginas_secao_id
  ON public.simulado_aluno_notebook_paginas (secao_id);
CREATE INDEX IF NOT EXISTS ix_leitura_anotacoes_documento
  ON public.simulado_leitura_anotacoes (documento_id);

-- (2) Índice duplicado: idx_cron_adapt_pm_plano_meta (plano_id, meta_id) é idêntico à UNIQUE
--     simulado_cronograma_adaptativo_plano_meta_plano_id_meta_id_key (usada pelo ON CONFLICT). Só custa escrita em 1,5M linhas.
DROP INDEX IF EXISTS public.idx_cron_adapt_pm_plano_meta;

-- (3) Autovacuum mais frequente em tabelas com muita rotatividade (padrão 20%/10% é tardio p/ tabelas grandes).
ALTER TABLE public.simulado_conteudo_trechos  SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE public.simulado_matriculas        SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);
ALTER TABLE public.simulado_favoritos         SET (autovacuum_vacuum_scale_factor = 0.02, autovacuum_analyze_scale_factor = 0.01);

-- (4) FUNÇÕES DE RETENÇÃO — apenas DEFINIDAS. NÃO agendadas, NÃO executadas. Cada chamada apaga no máximo p_lote linhas
--     (lotes pequenos = lock/WAL curtos) e retorna quantas apagou; quem agendar deve repetir até retornar 0.
--     EXECUTE só para service_role (nunca anon/authenticated). Para testar sem apagar: SELECT count(*) com o mesmo filtro.

-- 4a) simulado_audit_logs com mais de p_dias (padrão 180). Obs.: se houver trigger de imutabilidade na tabela, o DELETE será barrado
--     (nesse caso a purga precisa ser autorizada explicitamente por quem agendar).
CREATE OR REPLACE FUNCTION public.purgar_audit_logs_antigos(p_dias integer DEFAULT 180, p_lote integer DEFAULT 5000)
RETURNS integer LANGUAGE plpgsql SET statement_timeout = '30s' AS $fn$
DECLARE n integer;
BEGIN
  IF p_dias < 90 THEN RAISE EXCEPTION 'retenção mínima de auditoria: 90 dias'; END IF;
  WITH alvo AS (
    SELECT id FROM public.simulado_audit_logs
     WHERE criado_em < now() - make_interval(days => p_dias)
     LIMIT GREATEST(1, LEAST(p_lote, 20000))
  )
  DELETE FROM public.simulado_audit_logs a USING alvo WHERE a.id = alvo.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $fn$;

-- 4b) simulado_webhook_inbox (caixa de entrada bruta; sem coluna de "processado": usa recebido_em) com mais de p_dias (padrão 60).
--     Só apaga respostas já concluídas (status_resp 2xx) — erros/4xx/5xx ficam p/ diagnóstico.
CREATE OR REPLACE FUNCTION public.purgar_webhook_inbox_processado(p_dias integer DEFAULT 60, p_lote integer DEFAULT 5000)
RETURNS integer LANGUAGE plpgsql SET statement_timeout = '30s' AS $fn$
DECLARE n integer;
BEGIN
  IF p_dias < 30 THEN RAISE EXCEPTION 'retenção mínima do webhook inbox: 30 dias'; END IF;
  WITH alvo AS (
    SELECT id FROM public.simulado_webhook_inbox
     WHERE recebido_em < now() - make_interval(days => p_dias) AND status_resp BETWEEN 200 AND 299
     LIMIT GREATEST(1, LEAST(p_lote, 20000))
  )
  DELETE FROM public.simulado_webhook_inbox w USING alvo WHERE w.id = alvo.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $fn$;

-- 4c) simulado_integracao_eventos já PROCESSADOS/IGNORADOS (processado_em preenchido) há mais de p_dias (padrão 60). 'erro'/'recebido' ficam.
CREATE OR REPLACE FUNCTION public.purgar_integracao_eventos_processados(p_dias integer DEFAULT 60, p_lote integer DEFAULT 5000)
RETURNS integer LANGUAGE plpgsql SET statement_timeout = '30s' AS $fn$
DECLARE n integer;
BEGIN
  IF p_dias < 30 THEN RAISE EXCEPTION 'retenção mínima de eventos de integração: 30 dias'; END IF;
  WITH alvo AS (
    SELECT id FROM public.simulado_integracao_eventos
     WHERE status IN ('processado', 'ignorado') AND processado_em IS NOT NULL
       AND processado_em < now() - make_interval(days => p_dias)
     LIMIT GREATEST(1, LEAST(p_lote, 20000))
  )
  DELETE FROM public.simulado_integracao_eventos e USING alvo WHERE e.id = alvo.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $fn$;

REVOKE ALL ON FUNCTION public.purgar_audit_logs_antigos(integer, integer)            FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purgar_webhook_inbox_processado(integer, integer)      FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purgar_integracao_eventos_processados(integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purgar_audit_logs_antigos(integer, integer)            TO service_role;
GRANT EXECUTE ON FUNCTION public.purgar_webhook_inbox_processado(integer, integer)      TO service_role;
GRANT EXECUTE ON FUNCTION public.purgar_integracao_eventos_processados(integer, integer) TO service_role;

NOTIFY pgrst, 'reload schema';
