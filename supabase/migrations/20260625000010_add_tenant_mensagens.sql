CREATE TABLE IF NOT EXISTS public.tenant_contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  whatsapp TEXT,
  email_suporte TEXT,
  telefone TEXT,
  link_ajuda TEXT,
  horario_atendimento TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tenant_mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chave TEXT NOT NULL,
  titulo TEXT NOT NULL,
  corpo TEXT NOT NULL,
  canal TEXT NOT NULL DEFAULT 'inapp',
  ativo BOOLEAN NOT NULL DEFAULT true,
  UNIQUE (chave),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.tenant_mensagens (chave, titulo, corpo) VALUES
  ('bloqueio_sem_matricula',     'Acesso não autorizado',        'Olá {{nome}}, você não possui matrícula ativa nesta plataforma. Entre em contato: {{contato}}'),
  ('bloqueio_fora_janela',       'Simulado não disponível',      'O simulado {{simulado}} não está disponível no momento. Aguarde o período de aplicação.'),
  ('bloqueio_prazo_expirado',    'Prazo expirado',               'Olá {{nome}}, o prazo para realizar o simulado {{simulado}} expirou. Entre em contato: {{contato}}'),
  ('bloqueio_tentativas',        'Tentativas esgotadas',         'Olá {{nome}}, você atingiu o limite de tentativas para {{simulado}}. Entre em contato: {{contato}}'),
  ('bloqueio_identidade',        'Identificação não encontrada', 'Não encontramos seu cadastro. Verifique seus dados ou entre em contato: {{contato}}'),
  ('liberacao_disponivel',       'Simulado disponível!',         'Olá {{nome}}, o simulado {{simulado}} já está disponível para você. Boas provas!'),
  ('liberacao_gabarito',         'Gabarito liberado',            'O gabarito do simulado {{simulado}} foi liberado. Acesse sua área do aluno para ver o resultado.'),
  ('liberacao_nota',             'Resultado disponível',         'Olá {{nome}}, sua nota no simulado {{simulado}} foi publicada. Acesse para conferir!'),
  ('alerta_tempo',               'Atenção: tempo acabando',      'Olá {{nome}}, você tem pouco tempo restante no simulado {{simulado}}. Finalize logo!'),
  ('alerta_prazo',               'Prazo encerrando em breve',    'Olá {{nome}}, o prazo para {{simulado}} encerra em {{prazo}}. Não deixe para depois!')
ON CONFLICT (chave) DO NOTHING;

ALTER TABLE public.tenant_contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_mensagens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage contatos" ON public.tenant_contatos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "all read contatos" ON public.tenant_contatos FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage mensagens" ON public.tenant_mensagens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "all read mensagens" ON public.tenant_mensagens FOR SELECT TO authenticated USING (true);

GRANT SELECT, INSERT, UPDATE ON public.tenant_contatos TO authenticated;
GRANT ALL ON public.tenant_contatos TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.tenant_mensagens TO authenticated;
GRANT ALL ON public.tenant_mensagens TO service_role;
