-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — contagem de metas por cronograma, agregada no banco
--
-- O catálogo precisa saber quantas metas cada cronograma tem. Fazer isso com um
-- `select cronograma_id` e contar na aplicação esbarra no teto de 1.000 linhas do
-- PostgREST: com 16.697 metas, só as ~1.000 primeiras voltavam, e todos os
-- cronogramas seguintes apareciam como "sem metas" — o que ainda desabilitava o
-- botão de liberar.
--
-- Paginar com fetchAll resolveria a correção, mas puxaria 16.697 linhas a cada
-- abertura da tela só para produzir 25 números. Agregar aqui devolve 25 linhas.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.simulado_cronograma_contar_metas(p_tenant uuid)
RETURNS TABLE (cronograma_id uuid, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.cronograma_id, count(*)::bigint
  FROM public.simulado_cronograma_metas m
  WHERE m.tenant_id = p_tenant
  GROUP BY m.cronograma_id;
$$;

/* Mesma ideia para os vínculos com pacotes: hoje são poucas linhas, mas a conta
   cresce com o uso e o teto é o mesmo. */
CREATE OR REPLACE FUNCTION public.simulado_cronograma_contar_pacotes(p_tenant uuid)
RETURNS TABLE (cronograma_id uuid, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT i.cronograma_id, count(*)::bigint
  FROM public.simulado_cronograma_pacote_itens i
  WHERE i.tenant_id = p_tenant
  GROUP BY i.cronograma_id;
$$;

DO $$
DECLARE r text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'simulado_cronograma_contar_metas(uuid)',
    'simulado_cronograma_contar_pacotes(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public;', f);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM %I;', f, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
