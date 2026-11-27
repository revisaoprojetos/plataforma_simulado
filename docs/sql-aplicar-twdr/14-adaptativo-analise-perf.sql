-- Análise de uso do Adaptativo: RPCs que varrem simulado_cronograma_adaptativo_plano_meta (~1,6 mi linhas) estouravam o tempo.
-- NÃO APLICADA: escrita para revisão. Não muda regra nem resultado. Medido em produção (leitura, tenant real):
--   * O plano GENÉRICO da função SQL escolhia NESTED LOOP (1.362 planos × ~1.000 index scans aleatórios em plano_meta):
--       an_funil 20,5 s -> 5,1 s | an_parados >60 s (timeout) -> 2,9 s | an_fixacao 15,0 s -> 7,0 s | an_resumo 14,6 s -> 8,0 s
--     com enable_nestloop = off (hash join + seq scan paralelo, ~3,2 s no núcleo). Só nessas 4: em an_sem_doc/an_orfas o nested loop é o plano bom.
--   * O padrão do PostgREST (authenticator) é statement_timeout = 8 s: as RPCs abaixo precisam de teto próprio (45 s), como an_resumo já tem.
-- Idempotente (ALTER FUNCTION ... SET sobrescreve). Assinaturas = as de 20261119030000_adaptativo_log_analise.sql.
ALTER FUNCTION public.simulado_cronograma_adaptativo_an_funil(uuid, date, date, uuid, text, text, text, text, text, text, integer, integer, text)
  SET enable_nestloop = off;
ALTER FUNCTION public.simulado_cronograma_adaptativo_an_funil(uuid, date, date, uuid, text, text, text, text, text, text, integer, integer, text)
  SET statement_timeout = '45s';
ALTER FUNCTION public.simulado_cronograma_adaptativo_an_parados(uuid, date, date, uuid, text, text, text, text, text, text, integer, integer, text)
  SET enable_nestloop = off;
ALTER FUNCTION public.simulado_cronograma_adaptativo_an_parados(uuid, date, date, uuid, text, text, text, text, text, text, integer, integer, text)
  SET statement_timeout = '45s';
ALTER FUNCTION public.simulado_cronograma_adaptativo_an_fixacao(uuid, date, date, uuid, text, text, text, text, text, text, integer, integer, text)
  SET enable_nestloop = off;
ALTER FUNCTION public.simulado_cronograma_adaptativo_an_fixacao(uuid, date, date, uuid, text, text, text, text, text, text, integer, integer, text)
  SET statement_timeout = '45s';
ALTER FUNCTION public.simulado_cronograma_adaptativo_an_resumo(uuid, date, date, uuid, text, text, text, text)
  SET enable_nestloop = off;
-- (an_resumo já tem statement_timeout = 45s de 20261201000000)
ALTER FUNCTION public.simulado_cronograma_adaptativo_an_sem_doc(uuid, date, date, uuid, text, text, text, text, text, text, integer, integer, text)
  SET statement_timeout = '45s';

-- "Metas sem documento" (an_sem_doc, 12-16 s): só ~102 mil das 1,6 mi linhas têm documento_id IS NULL em tipos de leitura.
-- Índice parcial COBRINDO as colunas lidas (index-only quando o mapa de visibilidade está em dia). Escrita extra só nessas linhas (~6%).
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_sem_doc
  ON public.simulado_cronograma_adaptativo_plano_meta (tenant_id, plano_id)
  INCLUDE (tipo, disciplina, titulo, aula, estudante_id)
  WHERE documento_id IS NULL AND tipo IN ('pf', 'pp', 'fl', 'rf', 'lp');

NOTIFY pgrst, 'reload schema';
