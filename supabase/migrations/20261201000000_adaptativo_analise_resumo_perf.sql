-- Análise de uso (Adaptativo): "canceling statement due to statement timeout" no RPC an_resumo.
-- Causa: a CTE `pa` agrega TODAS as plano_meta dos planos do tenant (≈ planos × metas) fazendo LEFT JOIN em `meta`
-- por (plano_id, meta_id) SEM índice nessa chave (só havia (tenant_id, estudante_id)), e a CTE `ev` varre meta_evento.
-- NÃO APLICADA: escrita para revisão. Não muda regra nem resultado; só índices + teto de tempo da função.
CREATE INDEX IF NOT EXISTS idx_cron_adapt_meta_plano_meta ON public.simulado_cronograma_adaptativo_meta (plano_id, meta_id) WHERE arquivada = false;
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_plano_meta   ON public.simulado_cronograma_adaptativo_plano_meta (plano_id, meta_id);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_plano_tenant_ativo ON public.simulado_cronograma_adaptativo_plano (tenant_id) WHERE arquivada = false AND exemplo = false;
-- Leitura administrativa pesada: teto maior só para esta função (o padrão do pooler é curto).
ALTER FUNCTION public.simulado_cronograma_adaptativo_an_resumo(uuid, date, date, uuid, text, text, text, text) SET statement_timeout = '45s';
NOTIFY pgrst, 'reload schema';
