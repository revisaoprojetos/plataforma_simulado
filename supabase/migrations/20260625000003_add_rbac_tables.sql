-- Full RBAC: roles, permissions, role_permissions tables
-- Additive: keeps existing user_roles (app_role enum) intact

CREATE TABLE IF NOT EXISTS public.roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  descricao TEXT,
  is_sistema BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, nome)
);

CREATE TABLE IF NOT EXISTS public.permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (resource, action)
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- user_roles_v2: new table with FK to roles (complements the old enum-based user_roles)
CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, tenant_id, role_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
GRANT SELECT, INSERT, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
GRANT SELECT, INSERT, DELETE ON public.user_role_assignments TO authenticated;
GRANT ALL ON public.user_role_assignments TO service_role;

ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage roles" ON public.roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "all read permissions" ON public.permissions FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage role_permissions" ON public.role_permissions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "admin manage user_role_assignments" ON public.user_role_assignments FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed core permissions
INSERT INTO public.permissions (resource, action) VALUES
  ('questoes',    'view'),    ('questoes',    'create'), ('questoes',    'update'), ('questoes',    'delete'),
  ('simulados',   'view'),    ('simulados',   'create'), ('simulados',   'update'), ('simulados',   'delete'), ('simulados', 'manage'),
  ('matriculas',  'view'),    ('matriculas',  'create'), ('matriculas',  'update'), ('matriculas',  'delete'),
  ('estudantes',  'view'),    ('estudantes',  'create'), ('estudantes',  'update'), ('estudantes',  'delete'),
  ('rbac',           'view'),    ('rbac',           'manage'),
  ('auditoria',      'view'),
  ('relatorios',     'view'),    ('relatorios',     'export'),
  ('configuracoes',  'view'),    ('configuracoes',  'manage'),
  ('api_keys',       'manage'),
  ('tenants',        'manage')
ON CONFLICT (resource, action) DO NOTHING;
