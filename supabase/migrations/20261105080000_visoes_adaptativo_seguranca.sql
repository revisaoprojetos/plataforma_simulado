-- CORREÇÃO DE SEGURANÇA das duas visões do Adaptativo (já criadas sem security_invoker → legíveis com a chave pública).
-- Idempotente. Rode no SQL Editor.
ALTER VIEW public.simulado_cronograma_adaptativo_metas_visao      SET (security_invoker = true);
ALTER VIEW public.simulado_cronograma_adaptativo_meta_def_analise SET (security_invoker = true);
REVOKE ALL ON public.simulado_cronograma_adaptativo_metas_visao      FROM anon, authenticated;
REVOKE ALL ON public.simulado_cronograma_adaptativo_meta_def_analise FROM anon, authenticated;
GRANT SELECT ON public.simulado_cronograma_adaptativo_metas_visao      TO service_role;
GRANT SELECT ON public.simulado_cronograma_adaptativo_meta_def_analise TO service_role;
NOTIFY pgrst, 'reload schema';
