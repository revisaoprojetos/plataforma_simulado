-- ============================================================================
-- Fase 1 (reorg multitenant) — SUPER-ADMIN GLOBAL
-- Acima de TODAS as plataformas. Diferente do super_admin POR-TENANT
-- (simulado_tenant_acessos.role = 'super_admin', que só vale dentro de 1 tenant):
-- este é GLOBAL e controla a gestão de plataformas, a entrada neutra e o
-- compartilhamento entre tenants. Por isso não tem tenant_id.
--
-- Sem FK para auth.users de propósito (o esqueleto migrado tem FKs quebradas p/
-- simulado_users — ver memória). A integridade fica na aplicação, que só grava
-- aqui via service role real (createAdminClient).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.simulado_super_admins (
  user_id    uuid PRIMARY KEY,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  criado_por uuid
);

-- RLS ligado SEM policy para 'authenticated': ninguém logado lê/escreve direto.
-- A app resolve "é super-admin?" via service role (bypassa RLS) — nunca confiando
-- no cliente. Isolamento por design.
ALTER TABLE public.simulado_super_admins ENABLE ROW LEVEL SECURITY;

-- Semente: o dono da conta, para não se trancar fora quando os gates virarem.
-- Adicione/edite os demais super-admins pela área de super-admin (Fase 1b).
INSERT INTO public.simulado_super_admins (user_id)
SELECT id FROM auth.users WHERE lower(email) = 'projetos@revisaopge.com.br'
ON CONFLICT (user_id) DO NOTHING;
