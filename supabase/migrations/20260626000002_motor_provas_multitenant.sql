-- =========================================================
-- MOTOR DE PROVAS — MULTI-TENANT
-- estudantes, simulados, simulado_questoes, matriculas,
-- sessoes_prova, sessao_questao_ordem, respostas_objetivas, sessao_eventos.
-- Depende de 20260626000000_fundacao_multitenant.sql + conteúdo (questoes/alternativas).
-- Alinhado às colunas que o código web (actions/pages) e a API (attempts.service) usam.
-- Idempotente (DROP + CREATE — tabelas de teste vazias).
-- =========================================================

DROP TABLE IF EXISTS
  public.sessao_eventos, public.respostas_objetivas, public.sessao_questao_ordem,
  public.sessoes_prova, public.matriculas, public.simulado_questoes, public.simulados,
  public.estudantes
CASCADE;

-- ----------------------------- ESTUDANTES -----------------------------
CREATE TABLE public.estudantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  nome TEXT NOT NULL,
  email TEXT,
  cpf TEXT,
  telefone TEXT,
  data_nascimento DATE,
  classificacao TEXT,
  matricula_externa TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);
CREATE INDEX idx_estudantes_tenant ON public.estudantes(tenant_id);
CREATE INDEX idx_estudantes_user ON public.estudantes(user_id);
DROP TRIGGER IF EXISTS trg_estudantes_updated ON public.estudantes;
CREATE TRIGGER trg_estudantes_updated BEFORE UPDATE ON public.estudantes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------- SIMULADOS -----------------------------
CREATE TABLE public.simulados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descricao TEXT,
  modo_aplicacao TEXT NOT NULL DEFAULT 'janela_fixa'
    CHECK (modo_aplicacao IN ('janela_fixa','prazo_relativo','aberto')),
  status TEXT NOT NULL DEFAULT 'rascunho'
    CHECK (status IN ('rascunho','publicado','encerrado')),
  data_inicio TIMESTAMPTZ,
  data_fim TIMESTAMPTZ,
  tempo_limite_min INTEGER,
  metodo_identificacao TEXT CHECK (metodo_identificacao IN ('email','email_cpf','email_telefone')),
  embed_ativo BOOLEAN NOT NULL DEFAULT false,
  embed_token TEXT UNIQUE DEFAULT gen_random_uuid()::text,
  regras JSONB NOT NULL DEFAULT '{}'::jsonb,
  criado_por UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_simulados_tenant_status ON public.simulados(tenant_id, status);
CREATE INDEX idx_simulados_janela ON public.simulados(data_inicio, data_fim);
DROP TRIGGER IF EXISTS trg_simulados_updated ON public.simulados;
CREATE TRIGGER trg_simulados_updated BEFORE UPDATE ON public.simulados
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------- SIMULADO_QUESTOES -----------------------------
CREATE TABLE public.simulado_questoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  simulado_id UUID NOT NULL REFERENCES public.simulados(id) ON DELETE CASCADE,
  questao_id UUID NOT NULL REFERENCES public.questoes(id) ON DELETE RESTRICT,
  ordem INTEGER NOT NULL DEFAULT 0,
  peso NUMERIC(6,2) NOT NULL DEFAULT 1,
  anulada BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (simulado_id, questao_id)
);
CREATE INDEX idx_simulado_questoes_simulado ON public.simulado_questoes(simulado_id, ordem);

-- ----------------------------- MATRICULAS -----------------------------
-- Suporta o web (liberado) e a API (status/validade) simultaneamente.
CREATE TABLE public.matriculas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  estudante_id UUID NOT NULL REFERENCES public.estudantes(id) ON DELETE CASCADE,
  simulado_id UUID NOT NULL REFERENCES public.simulados(id) ON DELETE CASCADE,
  liberado BOOLEAN NOT NULL DEFAULT true,
  status TEXT NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','expirada','cancelada')),
  plano TEXT,
  validade TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (estudante_id, simulado_id)
);
CREATE INDEX idx_matriculas_simulado ON public.matriculas(simulado_id);
CREATE INDEX idx_matriculas_estudante ON public.matriculas(estudante_id);

-- ----------------------------- SESSOES_PROVA -----------------------------
CREATE TABLE public.sessoes_prova (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  simulado_id UUID NOT NULL REFERENCES public.simulados(id) ON DELETE CASCADE,
  estudante_id UUID NOT NULL REFERENCES public.estudantes(id) ON DELETE CASCADE,
  tentativa_num INTEGER NOT NULL DEFAULT 1,
  is_teste BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'em_andamento'
    CHECK (status IN ('aguardando','em_andamento','finalizada')),
  iniciado_em TIMESTAMPTZ,
  finalizado_em TIMESTAMPTZ,
  nota NUMERIC(8,2),
  posicao_ranking INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessoes_simulado_status ON public.sessoes_prova(simulado_id, status) WHERE is_teste = false;
CREATE INDEX idx_sessoes_estudante ON public.sessoes_prova(estudante_id);
DROP TRIGGER IF EXISTS trg_sessoes_updated ON public.sessoes_prova;
CREATE TRIGGER trg_sessoes_updated BEFORE UPDATE ON public.sessoes_prova
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------- SESSAO_QUESTAO_ORDEM (embaralhamento determinístico) -----------------------------
CREATE TABLE public.sessao_questao_ordem (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sessao_id UUID NOT NULL REFERENCES public.sessoes_prova(id) ON DELETE CASCADE,
  questao_id UUID NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  ordem_exibida INTEGER NOT NULL,
  ordem_alternativas JSONB,
  UNIQUE (sessao_id, questao_id)
);
CREATE INDEX idx_sessao_ordem_sessao ON public.sessao_questao_ordem(sessao_id, ordem_exibida);

-- ----------------------------- RESPOSTAS_OBJETIVAS (auto-save idempotente) -----------------------------
CREATE TABLE public.respostas_objetivas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sessao_id UUID NOT NULL REFERENCES public.sessoes_prova(id) ON DELETE CASCADE,
  questao_id UUID NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  alternativa_id UUID REFERENCES public.alternativas(id) ON DELETE SET NULL,
  correta BOOLEAN,
  pontuacao NUMERIC(8,2),
  snapshot_gabarito JSONB,
  tempo_resposta_seg INTEGER,
  respondido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (sessao_id, questao_id)
);
CREATE INDEX idx_respostas_sessao ON public.respostas_objetivas(sessao_id);

-- ----------------------------- SESSAO_EVENTOS (trilha / antifraude) -----------------------------
CREATE TABLE public.sessao_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  sessao_id UUID NOT NULL REFERENCES public.sessoes_prova(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessao_eventos_sessao ON public.sessao_eventos(sessao_id, tipo, criado_em DESC);

-- ----------------------------- GRANTS + RLS (isolamento por tenant) -----------------------------
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'estudantes','simulados','simulado_questoes','matriculas',
    'sessoes_prova','sessao_questao_ordem','respostas_objetivas','sessao_eventos'
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
