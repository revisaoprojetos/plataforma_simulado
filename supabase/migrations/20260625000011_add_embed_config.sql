CREATE TABLE IF NOT EXISTS public.embed_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origens_permitidas TEXT[] NOT NULL DEFAULT '{}',
  metodo_identificacao TEXT NOT NULL DEFAULT 'email',
  otp_email BOOLEAN NOT NULL DEFAULT false,
  ativo BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO public.embed_config (origens_permitidas, metodo_identificacao)
VALUES ('{}', 'email_cpf')
ON CONFLICT DO NOTHING;

ALTER TABLE public.embed_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage embed_config" ON public.embed_config FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.embed_config TO authenticated;
GRANT ALL ON public.embed_config TO service_role;

-- Add embed columns to simulados if they don't exist yet
ALTER TABLE public.simulados
  ADD COLUMN IF NOT EXISTS embed_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS embed_ativo BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS metodo_identificacao TEXT,
  ADD COLUMN IF NOT EXISTS modo_aplicacao TEXT NOT NULL DEFAULT 'janela_fixa',
  ADD COLUMN IF NOT EXISTS tempo_limite_min INTEGER,
  ADD COLUMN IF NOT EXISTS regras JSONB;
