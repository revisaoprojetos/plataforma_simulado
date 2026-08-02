-- =====================================================================
-- Nota média do dashboard via agregação NO BANCO (não transfere linhas).
-- Substitui o fetchAll+avg em JS. O app chama svc.rpc('simulado_nota_media', {p_tenant}).
-- Enquanto esta função não existir, o código cai no cálculo antigo (fallback), então é
-- seguro deployar o app antes de rodar este SQL.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.simulado_nota_media(p_tenant uuid)
RETURNS double precision
LANGUAGE sql
STABLE
AS $$
  SELECT avg(nota)
    FROM public.simulado_sessoes_prova
   WHERE tenant_id = p_tenant
     AND status = 'finalizada'
     AND is_teste = false
     AND deletado = false
     AND nota IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.simulado_nota_media(uuid) TO authenticated, service_role, anon;

-- (opcional) índice parcial que ajuda esta agregação e os relatórios por tenant:
CREATE INDEX IF NOT EXISTS idx_sessoes_tenant_finalizada
  ON public.simulado_sessoes_prova (tenant_id)
  WHERE status = 'finalizada' AND is_teste = false AND deletado = false AND nota IS NOT NULL;
