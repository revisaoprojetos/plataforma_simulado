-- Preferências de UI POR ADMIN (por user+tenant): ex. o tipo de exibição salvo da Aplicação de
-- Simulado (linhas/pastas/status). Fica em jsonb na própria linha de acesso do admin ao tenant, então
-- é individual e segue o admin entre dispositivos. Admin novo = {} (cai no padrão até ele mudar).
ALTER TABLE public.simulado_tenant_acessos
  ADD COLUMN IF NOT EXISTS prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

NOTIFY pgrst, 'reload schema';
