
ALTER TABLE public.simulados
  ADD COLUMN IF NOT EXISTS token_acesso text,
  ADD COLUMN IF NOT EXISTS link_expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS link_revogado_em timestamptz;

UPDATE public.simulados
   SET token_acesso = encode(extensions.gen_random_bytes(16), 'hex')
 WHERE token_acesso IS NULL;

ALTER TABLE public.simulados
  ALTER COLUMN token_acesso SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS simulados_token_acesso_key
  ON public.simulados (token_acesso);
