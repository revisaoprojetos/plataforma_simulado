-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — acesso DIRETO por cronograma (igual ao simulado)
--
-- Cada cronograma do catálogo pode ser liberado, sem passar por pacote:
--   (a) para TODOS os alunos do tenant   → simulado_cronogramas.acesso_gratuito
--   (b) para GRUPOS de alunos            → simulado_cronograma_grupos
--   (c) para ESTUDANTES específicos      → simulado_cronograma_estudantes
--
-- Por que recriar `simulado_cronogramas.acesso_gratuito`?
--   A migração 20260821000003 REMOVEU essa coluna de propósito, para o catálogo não ter
--   uma "porta dos fundos" fora do pacote. Decisão revista: agora o acesso direto por
--   cronograma é desejado (decisão do usuário). A regra do PACOTE (pacotes.acesso_gratuito
--   e vínculos de pacote) continua intacta e soma-se a esta. Nada no código depende da
--   coluna ter sido removida (a 20260821000003 já migrou os dados e nenhum SELECT atual
--   referencia simulado_cronogramas.acesso_gratuito).
--
-- `simulado_cronograma_grupos` JÁ EXISTE (criada em 20260820000010, com id uuid + UNIQUE
-- (cronograma_id, grupo_id), criado_em). Estava sem uso; passa a ser a tabela do acesso por
-- grupo. CREATE ... IF NOT EXISTS abaixo é no-op nesse caso (mantém o formato legado).
--
-- A via continua 'pacote' para o app (CHECK de emissoes.via_acesso intocado). Resolução por
-- JUNÇÃO na leitura (sem materializar matrícula), como nos pacotes.
-- Aditiva e idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- (a) Liberar para todos
ALTER TABLE public.simulado_cronogramas
  ADD COLUMN IF NOT EXISTS acesso_gratuito boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.simulado_cronogramas.acesso_gratuito IS
  'Acesso direto: libera ESTE cronograma (se status=liberado) para TODOS os alunos do tenant, independente de pacote.';

-- (b) Grupos (no-op se já existir)
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_grupos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  cronograma_id uuid NOT NULL REFERENCES public.simulado_cronogramas(id) ON DELETE CASCADE,
  grupo_id      uuid NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cronograma_id, grupo_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_grupos_grupo
  ON public.simulado_cronograma_grupos (tenant_id, grupo_id);

-- (c) Estudantes específicos
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_estudantes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  cronograma_id uuid NOT NULL REFERENCES public.simulado_cronogramas(id) ON DELETE CASCADE,
  estudante_id  uuid NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cronograma_id, estudante_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_estudantes_est
  ON public.simulado_cronograma_estudantes (tenant_id, estudante_id);

-- RLS: mesmo padrão das tabelas de pacote.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_cronograma_grupos','simulado_cronograma_estudantes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
    EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
      USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: mesma assinatura/colunas (cronograma_id, pacote_id, via). As 3 fontes novas
-- devolvem pacote_id NULL. As 3 fontes de pacote ficam EXATAMENTE como na 20260821000003.
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
  WHERE pg.tenant_id = p_tenant AND gm.estudante_id = p_estudante

  UNION

  -- ACESSO DIRETO: cronograma liberado para TODOS
  SELECT c.id, NULL::uuid, 'cronograma_gratuito'::text
  FROM public.simulado_cronogramas c
  WHERE c.tenant_id = p_tenant AND c.acesso_gratuito AND c.deletado = false AND c.status = 'liberado'

  UNION

  -- ACESSO DIRETO: cronograma vinculado a um grupo do qual o aluno é membro
  SELECT c.id, NULL::uuid, 'cronograma_grupo'::text
  FROM public.simulado_grupo_membros gm
  JOIN public.simulado_cronograma_grupos cg ON cg.grupo_id = gm.grupo_id
  JOIN public.simulado_cronogramas c ON c.id = cg.cronograma_id
  WHERE cg.tenant_id = p_tenant AND gm.estudante_id = p_estudante
    AND c.tenant_id = p_tenant AND c.deletado = false AND c.status = 'liberado'

  UNION

  -- ACESSO DIRETO: cronograma vinculado ao aluno
  SELECT c.id, NULL::uuid, 'cronograma_direto'::text
  FROM public.simulado_cronograma_estudantes ce
  JOIN public.simulado_cronogramas c ON c.id = ce.cronograma_id
  WHERE ce.tenant_id = p_tenant AND ce.estudante_id = p_estudante
    AND c.tenant_id = p_tenant AND c.deletado = false AND c.status = 'liberado';
$$;

-- Mantém o REVOKE da 20260820000016 (CREATE OR REPLACE preserva grants, reforço idempotente).
REVOKE ALL ON FUNCTION public.simulado_cronograma_do_aluno(uuid, uuid) FROM public;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.simulado_cronograma_do_aluno(uuid, uuid) FROM %I;', r);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
