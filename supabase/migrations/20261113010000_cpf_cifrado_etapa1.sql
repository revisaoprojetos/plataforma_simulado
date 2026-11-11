-- CPF criptografado em repouso — ETAPA 1 (aditiva, sem risco: nada é apagado nem muda de comportamento).
--  * cpf_enc  = CPF cifrado (AES-256-GCM, formato "enc:v1:…", chave APP_ENCRYPTION_KEY do ambiente — NUNCA no banco)
--  * cpf_hash = HMAC-SHA256 do CPF só com dígitos (chave derivada da mesma APP_ENCRYPTION_KEY) → permite BUSCAR e checar
--               duplicidade por igualdade sem precisar decifrar ninguém.
-- A coluna `cpf` em texto aberto continua existindo e sendo lida até a ETAPA FINAL (depois de backfill + leitura migrada).
-- Depois de aplicar: NOTIFY pgrst, 'reload schema'.

ALTER TABLE public.simulado_estudantes
  ADD COLUMN IF NOT EXISTS cpf_enc  text,
  ADD COLUMN IF NOT EXISTS cpf_hash text;

-- Busca por igualdade (login por CPF, webhooks, importação, duplicidade) dentro do tenant.
CREATE INDEX IF NOT EXISTS idx_estudantes_tenant_cpf_hash
  ON public.simulado_estudantes (tenant_id, cpf_hash)
  WHERE cpf_hash IS NOT NULL;

COMMENT ON COLUMN public.simulado_estudantes.cpf_enc  IS 'CPF cifrado (AES-256-GCM, enc:v1). Chave só no ambiente.';
COMMENT ON COLUMN public.simulado_estudantes.cpf_hash IS 'HMAC-SHA256(dígitos do CPF) para busca por igualdade. Não reversível.';

NOTIFY pgrst, 'reload schema';
