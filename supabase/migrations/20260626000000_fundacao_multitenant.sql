-- =========================================================
-- FUNDAÇÃO MULTI-TENANT (Supabase)
-- tenants + tenant_acessos + helper de isolamento RLS + seed.
-- Base para TODAS as tabelas de negócio: cada uma carrega tenant_id
-- e isola via policy USING (tenant_id IN (SELECT user_tenant_ids())).
-- Idempotente.
-- =========================================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ----------------------------- TENANTS (global) -----------------------------
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,            -- subdomínio (ex.: 'revisaopge')
  dominio TEXT UNIQUE,                  -- domínio custom opcional
  tema JSONB NOT NULL DEFAULT '{}'::jsonb,
  plano TEXT NOT NULL DEFAULT 'basico',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
DROP TRIGGER IF EXISTS trg_tenants_updated ON public.tenants;
CREATE TRIGGER trg_tenants_updated BEFORE UPDATE ON public.tenants
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------- TENANT_ACESSOS (liga user ↔ tenant) -----------------------------
CREATE TABLE IF NOT EXISTS public.tenant_acessos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'estudante',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_tenant_acessos_user ON public.tenant_acessos(user_id);
CREATE INDEX IF NOT EXISTS idx_tenant_acessos_tenant ON public.tenant_acessos(tenant_id);

-- ----------------------------- HELPER DE ISOLAMENTO (RLS) -----------------------------
-- Retorna os tenants que o usuário autenticado atual pode acessar.
-- SECURITY DEFINER evita recursão de RLS ao ler tenant_acessos dentro das policies.
CREATE OR REPLACE FUNCTION public.user_tenant_ids()
RETURNS SETOF UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT tenant_id FROM public.tenant_acessos
  WHERE user_id = auth.uid() AND ativo = true
$$;

-- ----------------------------- GRANTS + RLS das tabelas de fundação -----------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenants TO authenticated;
GRANT ALL ON public.tenants TO service_role;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant self read" ON public.tenants;
CREATE POLICY "tenant self read" ON public.tenants
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.user_tenant_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tenant_acessos TO authenticated;
GRANT ALL ON public.tenant_acessos TO service_role;
ALTER TABLE public.tenant_acessos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_acessos self read" ON public.tenant_acessos;
CREATE POLICY "tenant_acessos self read" ON public.tenant_acessos
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ----------------------------- SEED: tenant inicial + vínculo do admin -----------------------------
-- Tenant default para desenvolvimento (slug 'demo' = resolvido em localhost).
INSERT INTO public.tenants (nome, slug, plano)
VALUES ('Plataforma Demo', 'demo', 'enterprise')
ON CONFLICT (slug) DO NOTHING;

-- Liga o admin existente (admin@teste.com) ao tenant demo como admin.
INSERT INTO public.tenant_acessos (user_id, tenant_id, role)
SELECT u.id, t.id, 'admin'
FROM auth.users u
CROSS JOIN public.tenants t
WHERE u.email = 'admin@teste.com' AND t.slug = 'demo'
ON CONFLICT (user_id, tenant_id) DO NOTHING;
