-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — anotações pessoais do aluno em cada meta
--
-- Mesma modelagem dos checks, e pelas mesmas razões:
--
-- A nota pertence à EMISSÃO, não à meta do catálogo. Dois alunos com o mesmo cronograma
-- escrevem coisas diferentes na mesma aula, e o mesmo aluno pode ter duas emissões do mesmo
-- cronograma com anotações independentes.
--
-- `meta_id` NÃO tem FK, e é escolha: reimportar o catálogo troca as metas por linhas novas
-- (DELETE + INSERT). Com ON DELETE CASCADE, uma reimportação apagaria as anotações de todos
-- os alunos de uma vez — e anotação, ao contrário de um check, é conteúdo que a pessoa
-- escreveu. Sem FK a linha sobrevive; `data` e `titulo` guardados no momento da escrita
-- deixam claro a que meta ela se referia, mesmo que a meta suma.
--
-- Nota vazia é APAGADA, não guardada em branco: "sem anotação" e "anotação vazia" são a
-- mesma coisa para quem lê, e manter linha vazia faria toda leitura filtrar por ela.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_cronograma_meta_notas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  emissao_id    uuid NOT NULL REFERENCES public.simulado_cronograma_emissoes(id) ON DELETE CASCADE,
  estudante_id  uuid NOT NULL,
  meta_id       uuid NOT NULL,
  texto         text NOT NULL CHECK (btrim(texto) <> ''),
  -- Snapshots do momento da escrita: a nota continua legível se a meta sair do catálogo.
  data          date,
  titulo        text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emissao_id, meta_id)
);

CREATE INDEX IF NOT EXISTS idx_cron_notas_emissao
  ON public.simulado_cronograma_meta_notas (tenant_id, emissao_id);
-- Para "o que este aluno anotou, mais recente primeiro".
CREATE INDEX IF NOT EXISTS idx_cron_notas_estudante
  ON public.simulado_cronograma_meta_notas (tenant_id, estudante_id, atualizado_em DESC);

CREATE OR REPLACE FUNCTION public.simulado_cronograma_notas_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_cron_notas_touch ON public.simulado_cronograma_meta_notas;
CREATE TRIGGER trg_cron_notas_touch BEFORE UPDATE ON public.simulado_cronograma_meta_notas
  FOR EACH ROW EXECUTE FUNCTION public.simulado_cronograma_notas_touch();

DO $$
DECLARE t text := 'simulado_cronograma_meta_notas';
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
  EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
    USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
END $$;

NOTIFY pgrst, 'reload schema';
