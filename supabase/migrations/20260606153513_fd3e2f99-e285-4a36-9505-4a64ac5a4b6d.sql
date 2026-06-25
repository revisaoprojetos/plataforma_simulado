
ALTER TABLE public.simulados
  ALTER COLUMN token_acesso SET DEFAULT encode(extensions.gen_random_bytes(16), 'hex');
