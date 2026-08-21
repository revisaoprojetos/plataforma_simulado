-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — o acesso gratuito passa do cronograma para o PACOTE
--
-- A liberação para todos os alunos era uma flag do cronograma, no catálogo. Isso
-- criava duas portas de entrada em telas diferentes: o pacote decidia quem recebe,
-- e o catálogo tinha um atalho que furava o pacote — sem aparecer em lugar nenhum
-- da tela de acesso.
--
-- Agora quem recebe é sempre decisão de UMA tela: Pacotes e acesso. O pacote pode
-- ser liberado para grupos, para alunos avulsos, ou para TODOS.
--
-- Migração trivial: nenhum cronograma tem a flag ligada hoje (conferido antes de
-- escrever esta migration). O passo de migração existe mesmo assim, para o caso de
-- outro ambiente ter dado diferente.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_cronograma_pacotes
  ADD COLUMN IF NOT EXISTS acesso_gratuito boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.simulado_cronograma_pacotes.acesso_gratuito IS
  'Libera os cronogramas deste pacote para TODOS os alunos do tenant, sem vínculo de grupo nem individual.';

-- Se algum cronograma estiver marcado como gratuito, cria um pacote que o carrega,
-- para o acesso não desaparecer silenciosamente com a remoção da coluna.
DO $$
DECLARE r record; v_pacote uuid;
BEGIN
  FOR r IN
    SELECT id, tenant_id, nome FROM public.simulado_cronogramas
    WHERE acesso_gratuito = true AND deletado = false
  LOOP
    SELECT id INTO v_pacote FROM public.simulado_cronograma_pacotes
      WHERE tenant_id = r.tenant_id AND lower(nome) = 'acesso gratuito';

    IF v_pacote IS NULL THEN
      INSERT INTO public.simulado_cronograma_pacotes (tenant_id, nome, descricao, acesso_gratuito)
      VALUES (r.tenant_id, 'Acesso gratuito',
              'Criado na migração: reúne os cronogramas que estavam marcados como gratuitos no catálogo.',
              true)
      RETURNING id INTO v_pacote;
    END IF;

    INSERT INTO public.simulado_cronograma_pacote_itens (tenant_id, pacote_id, cronograma_id)
    VALUES (r.tenant_id, v_pacote, r.id)
    ON CONFLICT (pacote_id, cronograma_id) DO NOTHING;
  END LOOP;
END $$;

ALTER TABLE public.simulado_cronogramas DROP COLUMN IF EXISTS acesso_gratuito;

-- ─────────────────────────────────────────────────────────────────────────────
-- A resolução de acesso passa a considerar o pacote gratuito: ele alcança todos os
-- alunos do tenant, sem precisar de linha em grupo nem em estudante.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_do_aluno(
  p_tenant uuid, p_estudante uuid
) RETURNS TABLE (cronograma_id uuid, pacote_id uuid, via text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  -- Pacote liberado para TODOS
  SELECT i.cronograma_id, p.id, 'pacote_gratuito'::text
  FROM public.simulado_cronograma_pacotes p
  JOIN public.simulado_cronograma_pacote_itens i ON i.pacote_id = p.id
  WHERE p.tenant_id = p_tenant AND p.ativo AND p.acesso_gratuito

  UNION

  -- Pelo aluno diretamente no pacote
  SELECT i.cronograma_id, p.id, 'pacote_direto'::text
  FROM public.simulado_cronograma_pacote_estudantes pe
  JOIN public.simulado_cronograma_pacotes p ON p.id = pe.pacote_id AND p.ativo
  JOIN public.simulado_cronograma_pacote_itens i ON i.pacote_id = p.id
  WHERE pe.tenant_id = p_tenant AND pe.estudante_id = p_estudante

  UNION

  -- Por um grupo de alunos vinculado ao pacote
  SELECT i.cronograma_id, p.id, 'pacote_grupo'::text
  FROM public.simulado_grupo_membros gm
  JOIN public.simulado_cronograma_pacote_grupos pg ON pg.grupo_id = gm.grupo_id
  JOIN public.simulado_cronograma_pacotes p ON p.id = pg.pacote_id AND p.ativo
  JOIN public.simulado_cronograma_pacote_itens i ON i.pacote_id = p.id
  WHERE pg.tenant_id = p_tenant AND gm.estudante_id = p_estudante;
$$;

NOTIFY pgrst, 'reload schema';
