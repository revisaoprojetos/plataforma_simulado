
-- =========================================================
-- Sprint 0 — Plataforma de Simulados
-- =========================================================

-- Utilitário updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ----------------------------- ROLES -----------------------------
CREATE TYPE public.app_role AS ENUM ('admin', 'estudante');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "users read own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "admins read all roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admins manage roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ----------------------------- ENUMS -----------------------------
CREATE TYPE public.simulado_status AS ENUM ('rascunho', 'agendado', 'em_andamento', 'encerrado', 'arquivado');
CREATE TYPE public.sessao_status   AS ENUM ('ativa', 'finalizada', 'expirada', 'cancelada');
CREATE TYPE public.feedback_tipo   AS ENUM ('duvida', 'erro', 'sugestao', 'elogio');
CREATE TYPE public.import_status   AS ENUM ('pendente', 'processando', 'concluido', 'falhou');

-- ----------------------------- ADMINISTRADORES -----------------------------
CREATE TABLE public.administradores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.administradores TO authenticated;
GRANT ALL ON public.administradores TO service_role;
ALTER TABLE public.administradores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read administradores"
ON public.administradores FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin manage administradores"
ON public.administradores FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_admin_updated BEFORE UPDATE ON public.administradores
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------- ESTUDANTES -----------------------------
CREATE TABLE public.estudantes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  nome TEXT,
  cpf TEXT,
  telefone TEXT,
  device_hash TEXT,
  primeiro_acesso TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_acesso TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_estudantes_email ON public.estudantes(email);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.estudantes TO authenticated;
GRANT ALL ON public.estudantes TO service_role;
ALTER TABLE public.estudantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage estudantes"
ON public.estudantes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_estudantes_updated BEFORE UPDATE ON public.estudantes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------- SIMULADOS -----------------------------
CREATE TABLE public.simulados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo TEXT NOT NULL,
  descricao TEXT,
  instrucoes TEXT,
  duracao_minutos INTEGER NOT NULL CHECK (duracao_minutos > 0),
  data_inicio TIMESTAMPTZ,
  data_fim TIMESTAMPTZ,
  status public.simulado_status NOT NULL DEFAULT 'rascunho',
  embaralhar_questoes BOOLEAN NOT NULL DEFAULT false,
  embaralhar_alternativas BOOLEAN NOT NULL DEFAULT false,
  permitir_revisao BOOLEAN NOT NULL DEFAULT true,
  mostrar_gabarito BOOLEAN NOT NULL DEFAULT false,
  criado_por UUID REFERENCES public.administradores(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_simulados_status ON public.simulados(status);
CREATE INDEX idx_simulados_janela ON public.simulados(data_inicio, data_fim);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulados TO authenticated;
GRANT ALL ON public.simulados TO service_role;
ALTER TABLE public.simulados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage simulados"
ON public.simulados FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_simulados_updated BEFORE UPDATE ON public.simulados
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------- QUESTÕES -----------------------------
CREATE TABLE public.questoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  enunciado TEXT NOT NULL,
  area TEXT,
  disciplina TEXT,
  topico TEXT,
  dificuldade SMALLINT CHECK (dificuldade BETWEEN 1 AND 5),
  fonte TEXT,
  explicacao TEXT,
  ativa BOOLEAN NOT NULL DEFAULT true,
  criada_por UUID REFERENCES public.administradores(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_questoes_disciplina ON public.questoes(disciplina);
CREATE INDEX idx_questoes_area ON public.questoes(area);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questoes TO authenticated;
GRANT ALL ON public.questoes TO service_role;
ALTER TABLE public.questoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage questoes"
ON public.questoes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_questoes_updated BEFORE UPDATE ON public.questoes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------- ALTERNATIVAS -----------------------------
CREATE TABLE public.alternativas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questao_id UUID NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  letra CHAR(1) NOT NULL,
  texto TEXT NOT NULL,
  correta BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (questao_id, letra)
);
CREATE INDEX idx_alternativas_questao ON public.alternativas(questao_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.alternativas TO authenticated;
GRANT ALL ON public.alternativas TO service_role;
ALTER TABLE public.alternativas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage alternativas"
ON public.alternativas FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ----------------------------- QUESTAO_SIMULADO -----------------------------
CREATE TABLE public.questao_simulado (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  simulado_id UUID NOT NULL REFERENCES public.simulados(id) ON DELETE CASCADE,
  questao_id UUID NOT NULL REFERENCES public.questoes(id) ON DELETE RESTRICT,
  ordem INTEGER NOT NULL,
  peso NUMERIC(6,2) NOT NULL DEFAULT 1,
  UNIQUE (simulado_id, questao_id),
  UNIQUE (simulado_id, ordem)
);
CREATE INDEX idx_qs_simulado ON public.questao_simulado(simulado_id, ordem);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questao_simulado TO authenticated;
GRANT ALL ON public.questao_simulado TO service_role;
ALTER TABLE public.questao_simulado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage questao_simulado"
ON public.questao_simulado FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ----------------------------- MATRICULAS -----------------------------
CREATE TABLE public.matriculas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estudante_id UUID NOT NULL REFERENCES public.estudantes(id) ON DELETE CASCADE,
  simulado_id UUID NOT NULL REFERENCES public.simulados(id) ON DELETE CASCADE,
  liberado BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (estudante_id, simulado_id)
);
CREATE INDEX idx_matriculas_simulado ON public.matriculas(simulado_id);
CREATE INDEX idx_matriculas_estudante ON public.matriculas(estudante_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.matriculas TO authenticated;
GRANT ALL ON public.matriculas TO service_role;
ALTER TABLE public.matriculas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage matriculas"
ON public.matriculas FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ----------------------------- SESSOES_PROVA -----------------------------
CREATE TABLE public.sessoes_prova (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matricula_id UUID NOT NULL REFERENCES public.matriculas(id) ON DELETE CASCADE,
  estudante_id UUID NOT NULL REFERENCES public.estudantes(id) ON DELETE CASCADE,
  simulado_id UUID NOT NULL REFERENCES public.simulados(id) ON DELETE CASCADE,
  status public.sessao_status NOT NULL DEFAULT 'ativa',
  iniciada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  expira_em TIMESTAMPTZ NOT NULL,
  finalizada_em TIMESTAMPTZ,
  ordem_questoes JSONB,
  device_hash TEXT,
  ip_inicio INET,
  ultima_heartbeat TIMESTAMPTZ,
  pontuacao NUMERIC(8,2),
  acertos INTEGER,
  total_questoes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sessoes_estudante ON public.sessoes_prova(estudante_id);
CREATE INDEX idx_sessoes_simulado ON public.sessoes_prova(simulado_id);
CREATE INDEX idx_sessoes_status ON public.sessoes_prova(status);
CREATE INDEX idx_sessoes_expira ON public.sessoes_prova(expira_em) WHERE status = 'ativa';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessoes_prova TO authenticated;
GRANT ALL ON public.sessoes_prova TO service_role;
ALTER TABLE public.sessoes_prova ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage sessoes"
ON public.sessoes_prova FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_sessoes_updated BEFORE UPDATE ON public.sessoes_prova
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------- RESPOSTAS -----------------------------
CREATE TABLE public.respostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id UUID NOT NULL REFERENCES public.sessoes_prova(id) ON DELETE CASCADE,
  questao_id UUID NOT NULL REFERENCES public.questoes(id) ON DELETE RESTRICT,
  alternativa_id UUID REFERENCES public.alternativas(id),
  marcada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  tempo_gasto_segundos INTEGER,
  correta BOOLEAN,
  UNIQUE (sessao_id, questao_id)
);
CREATE INDEX idx_respostas_sessao ON public.respostas(sessao_id);
CREATE INDEX idx_respostas_questao ON public.respostas(questao_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.respostas TO authenticated;
GRANT ALL ON public.respostas TO service_role;
ALTER TABLE public.respostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage respostas"
ON public.respostas FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ----------------------------- FEEDBACKS -----------------------------
CREATE TABLE public.feedbacks_questao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  questao_id UUID NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  sessao_id UUID REFERENCES public.sessoes_prova(id) ON DELETE SET NULL,
  estudante_id UUID REFERENCES public.estudantes(id) ON DELETE SET NULL,
  tipo public.feedback_tipo NOT NULL,
  mensagem TEXT NOT NULL,
  resolvido BOOLEAN NOT NULL DEFAULT false,
  resposta_admin TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_feedbacks_questao ON public.feedbacks_questao(questao_id);
CREATE INDEX idx_feedbacks_resolvido ON public.feedbacks_questao(resolvido);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.feedbacks_questao TO authenticated;
GRANT ALL ON public.feedbacks_questao TO service_role;
ALTER TABLE public.feedbacks_questao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage feedbacks"
ON public.feedbacks_questao FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_feedbacks_updated BEFORE UPDATE ON public.feedbacks_questao
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------- AUDIT_LOGS -----------------------------
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ator_tipo TEXT NOT NULL,
  ator_id UUID,
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id UUID,
  detalhes JSONB,
  ip INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_entidade ON public.audit_logs(entidade, entidade_id);
CREATE INDEX idx_audit_ator ON public.audit_logs(ator_tipo, ator_id);
CREATE INDEX idx_audit_created ON public.audit_logs(created_at DESC);
GRANT SELECT, INSERT ON public.audit_logs TO authenticated;
GRANT ALL ON public.audit_logs TO service_role;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin read audit"
ON public.audit_logs FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin insert audit"
ON public.audit_logs FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ----------------------------- IMPORT_JOBS -----------------------------
CREATE TABLE public.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL,
  status public.import_status NOT NULL DEFAULT 'pendente',
  arquivo_nome TEXT,
  total_linhas INTEGER,
  linhas_ok INTEGER NOT NULL DEFAULT 0,
  linhas_erro INTEGER NOT NULL DEFAULT 0,
  erros JSONB,
  iniciado_por UUID REFERENCES public.administradores(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage import_jobs"
ON public.import_jobs FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_import_jobs_updated BEFORE UPDATE ON public.import_jobs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------- TRIGGER: novo usuário vira admin se for o primeiro -----------------------------
CREATE OR REPLACE FUNCTION public.handle_new_admin_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_first BOOLEAN;
BEGIN
  -- Cria registro de administrador apenas quando metadata indicar
  IF (NEW.raw_user_meta_data->>'role') = 'admin' OR NOT EXISTS (SELECT 1 FROM public.administradores) THEN
    SELECT NOT EXISTS (SELECT 1 FROM public.administradores) INTO is_first;

    INSERT INTO public.administradores (user_id, nome, email)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)),
      NEW.email
    )
    ON CONFLICT (user_id) DO NOTHING;

    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_admin_user();
