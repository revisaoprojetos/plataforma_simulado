-- Config GLOBAL (uma linha) do serviço de vídeo. Substitui as env VIDEO_* (que continuam como fallback).
-- Acesso SOMENTE por service role: RLS ligado e nenhuma policy para anon/authenticated.
-- Segredos cifrados com APP_ENCRYPTION_KEY (lib/crypto.ts, formato enc:v1:...).
CREATE TABLE IF NOT EXISTS public.video_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  url_interna text NOT NULL DEFAULT 'http://video-api:3000',
  prefixo_publico text NOT NULL DEFAULT '/video-api',
  chave_integracao_enc text,
  admin_email text,
  admin_senha_enc text,
  ativo boolean NOT NULL DEFAULT false,
  atualizado_em timestamptz DEFAULT now(),
  atualizado_por uuid
);

ALTER TABLE public.video_config ENABLE ROW LEVEL SECURITY;
-- Propositalmente SEM policy: anon/authenticated não leem nem gravam; service role ignora RLS.
DROP POLICY IF EXISTS video_config_sem_acesso_publico ON public.video_config;
REVOKE ALL ON public.video_config FROM anon, authenticated;

INSERT INTO public.video_config (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
