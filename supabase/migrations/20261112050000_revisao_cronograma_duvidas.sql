-- PLATAFORMA REVISÃO (admin) — Cronograma Adaptativo (regras do admin, disciplinas, sprints, versões) + encaminhamento de dúvidas.
-- Aditiva e idempotente. Aplicação MANUAL no SQL Editor (não aplicada automaticamente).
-- RLS por tenant (mesmo padrão de simulado_cronograma_adaptativo_meta_def).
-- Tudo é acessado pelo servidor com service role (createAdminClient) após checkPermission; a RLS é a 2ª barreira.

-- 1) Regras do cronograma (1 linha por tenant). `valores` = TODAS as regras (chave → valor); vazio = padrão Cronograma Adaptativo 2.0.
CREATE TABLE IF NOT EXISTS public.simulado_revisao_cron_regras (
  tenant_id      uuid PRIMARY KEY,
  valores        jsonb NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);

-- 2) Disciplinas do cronograma: o que cada disciplina recebe (PDFlash/PDFight) e se está no cronograma.
--    As disciplinas do catálogo aparecem sozinhas (padrão: PDFlash conforme a config do motor, PDFight ligado, ativa);
--    uma linha aqui só existe quando o admin mudou algo ou adicionou uma disciplina manual.
CREATE TABLE IF NOT EXISTS public.simulado_revisao_cron_disciplinas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  nome          text NOT NULL,
  pdflash       boolean NOT NULL DEFAULT true,
  pdfight       boolean NOT NULL DEFAULT true,
  ativa         boolean NOT NULL DEFAULT true,
  manual        boolean NOT NULL DEFAULT false, -- true = criada aqui (não vem do catálogo) → pode ser removida
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

-- 3) Versões salvas das regras (snapshot de regras + disciplinas). Imutáveis; numeradas por tenant.
CREATE TABLE IF NOT EXISTS public.simulado_revisao_cron_versoes (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  numero        integer NOT NULL,
  snap          jsonb NOT NULL,                 -- { regras:{…}, disciplinas:[{nome,pdflash,pdfight,ativa}] }
  n_alteradas   integer NOT NULL DEFAULT 0,     -- regras diferentes do 2.0 na hora de salvar
  aulas         integer NOT NULL DEFAULT 0,     -- aulas no cronograma na hora de salvar
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, numero)
);
CREATE INDEX IF NOT EXISTS idx_revisao_cron_versoes_tenant ON public.simulado_revisao_cron_versoes (tenant_id, criado_em DESC);

-- 4) Sprints (trilha comum, igual para todos os alunos do sprint).
CREATE TABLE IF NOT EXISTS public.simulado_revisao_cron_sprints (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  nome          text NOT NULL,
  dias          integer NOT NULL DEFAULT 0 CHECK (dias >= 0),
  metas         integer NOT NULL DEFAULT 0 CHECK (metas >= 0),
  status        text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'ativo', 'encerrado')),
  observacao    text,
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revisao_cron_sprints_tenant ON public.simulado_revisao_cron_sprints (tenant_id, criado_em DESC);

-- 5) Encaminhamento de dúvida a um professor (Central de Dúvidas). Histórico imutável.
CREATE TABLE IF NOT EXISTS public.simulado_revisao_duvida_encaminhamentos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  duvida_id      uuid NOT NULL,
  professor_id   uuid,                 -- user_id do admin/professor (quando escolhido da equipe)
  professor_nome text NOT NULL,
  nota           text,
  encaminhado_por uuid,
  criado_em      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_revisao_duvida_enc ON public.simulado_revisao_duvida_encaminhamentos (tenant_id, duvida_id, criado_em DESC);

-- RLS por tenant (todas)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_revisao_cron_regras', 'simulado_revisao_cron_disciplinas', 'simulado_revisao_cron_versoes',
    'simulado_revisao_cron_sprints', 'simulado_revisao_duvida_encaminhamentos'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_isolation', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true)) WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))',
      t || '_isolation', t);
  END LOOP;
END $$;

COMMENT ON TABLE public.simulado_revisao_cron_regras IS 'Regras do Cronograma Adaptativo editadas no admin Plataforma Revisão (contrato p/ o motor; começa no padrão 2.0).';
COMMENT ON TABLE public.simulado_revisao_cron_disciplinas IS 'Disciplinas do cronograma: recebe PDFlash/PDFight e está no cronograma (override sobre o catálogo).';
COMMENT ON TABLE public.simulado_revisao_cron_versoes IS 'Versões salvas das regras + disciplinas do cronograma (imutáveis).';
COMMENT ON TABLE public.simulado_revisao_cron_sprints IS 'Trilhas de sprint do cronograma (trilha comum a todos os alunos do sprint).';
COMMENT ON TABLE public.simulado_revisao_duvida_encaminhamentos IS 'Histórico de encaminhamentos de dúvidas a professores.';
