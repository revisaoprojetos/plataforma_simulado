-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — pacotes (grupos de cronogramas) e liberação por vínculo
--
-- Renumerada de 20260821000001 para 20260820000016. A main trouxe 20260821000001_etiqueta_funcao.sql, e o Supabase
-- identifica a migração pelo PREFIXO numérico: dois arquivos com o mesmo número fazem um
-- dos dois ser considerado já aplicado e nunca rodar. O número novo mantém a ordem relativa
-- às demais migrações do cronograma.
--
-- A equipe agrupa cronogramas num PACOTE e libera o pacote para alunos ou para
-- grupos de alunos. É o mesmo raciocínio do "banco" dos simulados, com uma
-- diferença deliberada no mecanismo:
--
--   O simulado MATERIALIZA a matrícula: entrar num grupo grava uma linha por
--   aluno por simulado — é de onde vêm as 94 mil linhas de simulado_matriculas.
--
--   Aqui o acesso é resolvido por JUNÇÃO na leitura. Vincular um grupo de 3.000
--   alunos grava UMA linha. Revogar é imediato e não varre nada. Nenhuma
--   matrícula em massa é criada.
--
-- `simulado_cronograma_matriculas` continua existindo para a EXCEÇÃO: liberar ou
-- bloquear um aluno específico, fora do que os pacotes dizem.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_cronograma_pacotes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  nome          text NOT NULL,
  descricao     text,
  cor           text,
  ordem         integer NOT NULL DEFAULT 0,
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cron_pacotes_nome
  ON public.simulado_cronograma_pacotes (tenant_id, lower(nome));

-- ─────────────────────────────────────────────────────────────────────────────
-- O QUE o pacote contém.
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_pacote_itens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  pacote_id     uuid NOT NULL REFERENCES public.simulado_cronograma_pacotes(id) ON DELETE CASCADE,
  cronograma_id uuid NOT NULL REFERENCES public.simulado_cronogramas(id) ON DELETE CASCADE,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pacote_id, cronograma_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_pacote_itens_cron
  ON public.simulado_cronograma_pacote_itens (tenant_id, cronograma_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- QUEM recebe: grupos de alunos (reusa `simulado_grupos`, o mesmo dos simulados)…
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_pacote_grupos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  pacote_id  uuid NOT NULL REFERENCES public.simulado_cronograma_pacotes(id) ON DELETE CASCADE,
  grupo_id   uuid NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pacote_id, grupo_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_pacote_grupos_grupo
  ON public.simulado_cronograma_pacote_grupos (tenant_id, grupo_id);

-- …e alunos avulsos, para quem não está em grupo nenhum.
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_pacote_estudantes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  pacote_id    uuid NOT NULL REFERENCES public.simulado_cronograma_pacotes(id) ON DELETE CASCADE,
  estudante_id uuid NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pacote_id, estudante_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_pacote_estudantes_est
  ON public.simulado_cronograma_pacote_estudantes (tenant_id, estudante_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Função de resolução: quais cronogramas este aluno alcança pelos pacotes.
--
-- Uma consulta só, em vez de três idas do app. O `SECURITY DEFINER` é seguro
-- porque o tenant vem por parâmetro e é filtrado em todos os níveis.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_do_aluno(
  p_tenant uuid, p_estudante uuid
) RETURNS TABLE (cronograma_id uuid, pacote_id uuid, via text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: mesmo isolamento por tenant das demais tabelas do módulo.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_cronograma_pacotes','simulado_cronograma_pacote_itens',
    'simulado_cronograma_pacote_grupos','simulado_cronograma_pacote_estudantes'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
    EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
      USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
