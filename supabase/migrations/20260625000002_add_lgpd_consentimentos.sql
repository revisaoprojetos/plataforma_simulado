-- LGPD: tabela de consentimentos de política de privacidade
CREATE TABLE IF NOT EXISTS public.lgpd_consentimentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  versao_politica TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  aceito_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, versao_politica)
);

CREATE INDEX idx_lgpd_consentimentos_user ON public.lgpd_consentimentos(user_id);

GRANT SELECT, INSERT ON public.lgpd_consentimentos TO authenticated;
GRANT ALL ON public.lgpd_consentimentos TO service_role;

ALTER TABLE public.lgpd_consentimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user read own consent"
  ON public.lgpd_consentimentos FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "user insert own consent"
  ON public.lgpd_consentimentos FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "service role manage consents"
  ON public.lgpd_consentimentos FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
