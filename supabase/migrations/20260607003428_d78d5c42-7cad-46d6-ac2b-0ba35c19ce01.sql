ALTER TABLE public.simulados
  ADD COLUMN IF NOT EXISTS solicitar_nome boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS solicitar_cpf boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS solicitar_telefone boolean NOT NULL DEFAULT false;