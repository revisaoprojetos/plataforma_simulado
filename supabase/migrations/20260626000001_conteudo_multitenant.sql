-- =========================================================
-- CONTEÚDO (Questões) MULTI-TENANT
-- Depende de 20260626000000_fundacao_multitenant.sql (tenants, user_tenant_ids()).
-- Cada tabela carrega tenant_id NOT NULL e isola via RLS por tenant.
-- Taxonomia é por-tenant (UNIQUE por tenant_id+nome): cada cliente tem a sua,
-- nasce conforme o conteúdo é cadastrado (sem base pré-pronta).
-- Idempotente.
-- =========================================================

-- Reset de definições anteriores SEM tenant_id (greenfield: tabelas de teste vazias).
-- Garante que a recriação abaixo aplique o schema multi-tenant correto.
DROP TABLE IF EXISTS
  public.questao_etiquetas, public.questao_pasta, public.questao_cargos,
  public.alternativas, public.questoes, public.assuntos, public.etiquetas,
  public.pastas, public.disciplinas, public.cargos, public.orgaos, public.bancas
CASCADE;

-- ----------------------------- TAXONOMIA ESTRUTURADA (por tenant) -----------------------------
CREATE TABLE IF NOT EXISTS public.bancas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);
CREATE TABLE IF NOT EXISTS public.orgaos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);
CREATE TABLE IF NOT EXISTS public.cargos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);
CREATE TABLE IF NOT EXISTS public.disciplinas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);
CREATE TABLE IF NOT EXISTS public.assuntos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  disciplina_id UUID REFERENCES public.disciplinas(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  pai_id UUID REFERENCES public.assuntos(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ----------------------------- ORGANIZAÇÃO LIVRE (por tenant) -----------------------------
CREATE TABLE IF NOT EXISTS public.pastas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  pai_id UUID REFERENCES public.pastas(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.etiquetas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  cor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

-- ----------------------------- QUESTÕES -----------------------------
CREATE TABLE IF NOT EXISTS public.questoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  external_id TEXT,
  tipo TEXT NOT NULL DEFAULT 'objetiva' CHECK (tipo IN ('objetiva','discursiva')),
  enunciado TEXT NOT NULL,
  banca_id UUID REFERENCES public.bancas(id) ON DELETE SET NULL,
  orgao_id UUID REFERENCES public.orgaos(id) ON DELETE SET NULL,
  ano INTEGER,
  disciplina_id UUID REFERENCES public.disciplinas(id) ON DELETE SET NULL,
  assunto_id UUID REFERENCES public.assuntos(id) ON DELETE SET NULL,
  nivel_dificuldade TEXT CHECK (nivel_dificuldade IN ('facil','medio','dificil')),
  gabarito_tipo TEXT NOT NULL DEFAULT 'oficial' CHECK (gabarito_tipo IN ('oficial','extraoficial')),
  comentario_professor TEXT,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','publicada','arquivada')),
  versao INTEGER NOT NULL DEFAULT 1,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_questoes_tenant_status ON public.questoes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_questoes_disciplina ON public.questoes(disciplina_id);
CREATE INDEX IF NOT EXISTS idx_questoes_banca ON public.questoes(banca_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_questoes_external_id ON public.questoes(tenant_id, external_id) WHERE external_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_questoes_updated ON public.questoes;
CREATE TRIGGER trg_questoes_updated BEFORE UPDATE ON public.questoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.alternativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  questao_id UUID NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  texto TEXT NOT NULL,
  correta BOOLEAN NOT NULL DEFAULT false,
  ordem INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_alternativas_questao ON public.alternativas(questao_id);

-- ----------------------------- JUNÇÕES N:N -----------------------------
CREATE TABLE IF NOT EXISTS public.questao_cargos (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  questao_id UUID NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  cargo_id UUID NOT NULL REFERENCES public.cargos(id) ON DELETE CASCADE,
  PRIMARY KEY (questao_id, cargo_id)
);
CREATE TABLE IF NOT EXISTS public.questao_pasta (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  questao_id UUID NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  pasta_id UUID NOT NULL REFERENCES public.pastas(id) ON DELETE CASCADE,
  PRIMARY KEY (questao_id, pasta_id)
);
CREATE TABLE IF NOT EXISTS public.questao_etiquetas (
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  questao_id UUID NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  etiqueta_id UUID NOT NULL REFERENCES public.etiquetas(id) ON DELETE CASCADE,
  PRIMARY KEY (questao_id, etiqueta_id)
);

-- ----------------------------- GRANTS + RLS (isolamento por tenant) -----------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'bancas','orgaos','cargos','disciplinas','assuntos',
    'pastas','etiquetas','questoes','alternativas',
    'questao_cargos','questao_pasta','questao_etiquetas'
  ]
  LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant isolation %1$s" ON public.%1$s', t);
    EXECUTE format(
      'CREATE POLICY "tenant isolation %1$s" ON public.%1$s FOR ALL TO authenticated '
      'USING (tenant_id IN (SELECT public.user_tenant_ids())) '
      'WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))', t);
  END LOOP;
END $$;
