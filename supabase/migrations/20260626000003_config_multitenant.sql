-- P1.2: tabelas de configuração multi-tenant (mensagens, contatos, embed).
-- Cria do zero (já com tenant_id). Idempotente: se já existirem sem tenant_id,
-- o ALTER abaixo adiciona a coluna.

-- ── tenant_mensagens ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_mensagens (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  chave       TEXT NOT NULL,
  titulo      TEXT NOT NULL,
  corpo       TEXT NOT NULL,
  canal       TEXT NOT NULL DEFAULT 'inapp',
  ativo       BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_mensagens ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- ── tenant_contatos ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_contatos (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  whatsapp            TEXT,
  email_suporte       TEXT,
  telefone            TEXT,
  link_ajuda          TEXT,
  horario_atendimento TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.tenant_contatos ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- ── embed_config ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.embed_config (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  origens_permitidas   TEXT[] NOT NULL DEFAULT '{}',
  metodo_identificacao TEXT NOT NULL DEFAULT 'email',
  otp_email            BOOLEAN NOT NULL DEFAULT false,
  ativo                BOOLEAN NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.embed_config ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE;

-- ── backfill (caso pré-existissem linhas sem tenant) ───────────────
UPDATE public.tenant_mensagens SET tenant_id = (SELECT id FROM public.tenants WHERE slug='demo') WHERE tenant_id IS NULL;
UPDATE public.tenant_contatos  SET tenant_id = (SELECT id FROM public.tenants WHERE slug='demo') WHERE tenant_id IS NULL;
UPDATE public.embed_config     SET tenant_id = (SELECT id FROM public.tenants WHERE slug='demo') WHERE tenant_id IS NULL;

-- ── unicidade / índices ────────────────────────────────────────────
ALTER TABLE public.tenant_mensagens DROP CONSTRAINT IF EXISTS tenant_mensagens_chave_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_mensagens_tenant_chave ON public.tenant_mensagens(tenant_id, chave);
CREATE INDEX IF NOT EXISTS idx_tenant_contatos_tenant ON public.tenant_contatos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_embed_config_tenant    ON public.embed_config(tenant_id);

-- ── RLS (isolamento por tenant; service-role bypassa) ──────────────
ALTER TABLE public.tenant_mensagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_contatos  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.embed_config     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_mensagens_isolation ON public.tenant_mensagens;
CREATE POLICY tenant_mensagens_isolation ON public.tenant_mensagens
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_acessos WHERE user_id = auth.uid() AND ativo = true));

DROP POLICY IF EXISTS tenant_contatos_isolation ON public.tenant_contatos;
CREATE POLICY tenant_contatos_isolation ON public.tenant_contatos
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_acessos WHERE user_id = auth.uid() AND ativo = true));

DROP POLICY IF EXISTS embed_config_isolation ON public.embed_config;
CREATE POLICY embed_config_isolation ON public.embed_config
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_acessos WHERE user_id = auth.uid() AND ativo = true));

-- ── seed do tenant demo (mensagens padrão + linhas de config) ──────
INSERT INTO public.tenant_mensagens (tenant_id, chave, titulo, corpo, canal, ativo)
SELECT t.id, m.chave, m.titulo, m.corpo, 'inapp', true
FROM public.tenants t
CROSS JOIN (VALUES
  ('bloqueio_sem_matricula',  'Acesso não autorizado',        'Olá {{nome}}, você não possui matrícula ativa nesta plataforma. Entre em contato: {{contato}}'),
  ('bloqueio_fora_janela',    'Simulado não disponível',      'O simulado {{simulado}} não está disponível no momento. Aguarde o período de aplicação.'),
  ('bloqueio_prazo_expirado', 'Prazo expirado',               'Olá {{nome}}, o prazo para realizar o simulado {{simulado}} expirou. Entre em contato: {{contato}}'),
  ('bloqueio_tentativas',     'Tentativas esgotadas',         'Olá {{nome}}, você atingiu o limite de tentativas para {{simulado}}. Entre em contato: {{contato}}'),
  ('bloqueio_identidade',     'Identificação não encontrada', 'Não encontramos seu cadastro. Verifique seus dados ou entre em contato: {{contato}}'),
  ('liberacao_disponivel',    'Simulado disponível!',         'Olá {{nome}}, o simulado {{simulado}} já está disponível para você. Boas provas!'),
  ('liberacao_gabarito',      'Gabarito liberado',            'O gabarito do simulado {{simulado}} foi liberado. Acesse sua área do aluno para ver o resultado.'),
  ('liberacao_nota',          'Resultado disponível',         'Olá {{nome}}, sua nota no simulado {{simulado}} foi publicada. Acesse para conferir!'),
  ('alerta_tempo',            'Atenção: tempo acabando',      'Olá {{nome}}, você tem pouco tempo restante no simulado {{simulado}}. Finalize logo!'),
  ('alerta_prazo',            'Prazo encerrando em breve',    'Olá {{nome}}, o prazo para {{simulado}} encerra em {{prazo}}. Não deixe para depois!')
) AS m(chave, titulo, corpo)
WHERE t.slug = 'demo'
ON CONFLICT (tenant_id, chave) DO NOTHING;

INSERT INTO public.tenant_contatos (tenant_id)
SELECT id FROM public.tenants WHERE slug='demo'
  AND NOT EXISTS (SELECT 1 FROM public.tenant_contatos c WHERE c.tenant_id = tenants.id);

INSERT INTO public.embed_config (tenant_id, origens_permitidas, metodo_identificacao, otp_email, ativo)
SELECT id, '{}', 'email', false, true FROM public.tenants WHERE slug='demo'
  AND NOT EXISTS (SELECT 1 FROM public.embed_config e WHERE e.tenant_id = tenants.id);
