-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — contagens dos pacotes agregadas no banco
--
-- A tela do pacote ficou lenta (~5s por clique) e a causa não era a gravação, era a
-- LEITURA que vinha depois: para montar a tela, `carregarPacote` paginava duas tabelas
-- inteiras só para produzir números.
--
--   simulado_cronograma_metas   16.697 linhas -> 17 idas ao PostgREST
--   simulado_grupo_membros      24.946 linhas -> 25 idas
--
-- São ~42 requisições de ~0,24s cada, e elas rodavam de novo a cada ação, porque toda
-- mutação chamava revalidatePath e a página inteira era remontada. Nenhuma delas
-- precisava das linhas: o que a tela mostra é "quantas metas", "quantos membros" e
-- "quantos alunos alcançados".
--
-- Agregando aqui, as mesmas contagens voltam em três consultas com uma linha por
-- cronograma, grupo e pacote.
-- ═══════════════════════════════════════════════════════════════════════════

/* Membros por grupo. Fica no namespace do cronograma de propósito: é o consumidor, e
   assim a função não colide com o que outras branches estejam criando para grupos. */
CREATE OR REPLACE FUNCTION public.simulado_cronograma_contar_membros_grupos(p_tenant uuid)
RETURNS TABLE (grupo_id uuid, total bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT gm.grupo_id, count(*)::bigint
  FROM public.simulado_grupo_membros gm
  WHERE gm.tenant_id = p_tenant
  GROUP BY gm.grupo_id;
$$;

/* Alcance de cada pacote: alunos DISTINTOS que chegam por grupo vinculado ou por vínculo
   individual. O UNION dentro do lateral é o que impede contar duas vezes quem está nos dois
   caminhos — era o Set<string> que a aplicação montava depois de baixar tudo.

   `p_pacote` nulo devolve todos (tela de lista); preenchido devolve um (tela de detalhe). */
CREATE OR REPLACE FUNCTION public.simulado_cronograma_pacotes_alcance(
  p_tenant uuid, p_pacote uuid DEFAULT NULL
) RETURNS TABLE (pacote_id uuid, alcance bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, count(DISTINCT alc.estudante_id)::bigint
  FROM public.simulado_cronograma_pacotes p
  LEFT JOIN LATERAL (
    SELECT gm.estudante_id
    FROM public.simulado_cronograma_pacote_grupos pg
    JOIN public.simulado_grupo_membros gm ON gm.grupo_id = pg.grupo_id
    WHERE pg.pacote_id = p.id
    UNION
    SELECT pe.estudante_id
    FROM public.simulado_cronograma_pacote_estudantes pe
    WHERE pe.pacote_id = p.id
  ) alc ON true
  WHERE p.tenant_id = p_tenant
    AND (p_pacote IS NULL OR p.id = p_pacote)
  GROUP BY p.id;
$$;

DO $$
DECLARE r text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'simulado_cronograma_contar_membros_grupos(uuid)',
    'simulado_cronograma_pacotes_alcance(uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public;', f);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM %I;', f, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Sem estes índices o GROUP BY vira varredura das tabelas inteiras — o gargalo mudaria de
-- lugar em vez de sumir. `IF NOT EXISTS` porque alguns já podem existir.
CREATE INDEX IF NOT EXISTS idx_grupo_membros_tenant_grupo
  ON public.simulado_grupo_membros (tenant_id, grupo_id);
CREATE INDEX IF NOT EXISTS idx_cron_pacote_grupos_pacote
  ON public.simulado_cronograma_pacote_grupos (pacote_id);
CREATE INDEX IF NOT EXISTS idx_cron_pacote_estudantes_pacote
  ON public.simulado_cronograma_pacote_estudantes (pacote_id);

NOTIFY pgrst, 'reload schema';
