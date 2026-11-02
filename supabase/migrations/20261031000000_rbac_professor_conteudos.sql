-- ============================================================================
-- RBAC — papel-semente `professor` + permissões da área de Conteúdos (Estúdio de Conteúdo)
--
-- Destrava o self-service do professor (Etapa 0 de docs/estudio-conteudo-implementacao.md).
-- Alinha com apps/web/lib/rbac-catalogo.ts, apps/web/lib/auth/onboard-tenant.ts (PROFESSOR_PERMS)
-- e scripts/seed-rbac.mjs.
--
-- Idempotente: todos os INSERTs usam ON CONFLICT ... DO NOTHING — pode rodar mais de uma vez.
-- Isolamento por tenant: o papel `professor` é criado POR tenant (como admin_conteudo);
-- as permissões (simulado_permissions) são um catálogo GLOBAL (sem tenant_id, por schema).
-- Não quebra nada existente: só INSERE (nenhum UPDATE/DELETE).
--
-- NÃO aplicar automaticamente. Aplicar manualmente e rodar: NOTIFY pgrst, 'reload schema';
-- ============================================================================

-- 1) Catálogo GLOBAL de permissões (simulado_permissions: UNIQUE(resource, action)).
--    Permissões novas da área de Conteúdos.
insert into public.simulado_permissions (resource, action) values
  ('produtos', 'create'), ('produtos', 'update'),
  ('biblioteca', 'view'), ('biblioteca', 'create'), ('biblioteca', 'update'), ('biblioteca', 'publicar'),
  ('flashcards', 'view'), ('flashcards', 'create'), ('flashcards', 'update'), ('flashcards', 'manage'),
  ('trilhas', 'view'), ('trilhas', 'create'), ('trilhas', 'update'), ('trilhas', 'manage'),
  ('classificacao', 'view'), ('classificacao', 'manage')
on conflict (resource, action) do nothing;

--    Permissões que o app já verifica (rbac-catalogo.ts) mas que podiam faltar na base migrada.
insert into public.simulado_permissions (resource, action) values
  ('correcao', 'view'), ('correcao', 'corrigir'),
  ('produtos', 'view'), ('produtos', 'manage'),
  ('liberacao', 'view'), ('liberacao', 'manage'),
  ('armazenamento', 'view'), ('armazenamento', 'manage')
on conflict (resource, action) do nothing;

-- 2) Papel `professor` por tenant.
--    OBS: simulado_roles NÃO tem UNIQUE(tenant_id, nome) (só PK em id) — o rename de
--    `roles`→`simulado_roles` não carregou a unique. Por isso usamos WHERE NOT EXISTS
--    (idempotente) em vez de ON CONFLICT, que falharia sem a constraint.
--    is_sistema = false → editável/removível pelo tenant (não é papel de sistema).
insert into public.simulado_roles (tenant_id, nome, descricao, is_sistema)
select t.id, 'professor',
       'Professor (conteúdo: questões, biblioteca, flashcards, trilhas, produtos)', false
from public.simulado_tenants t
where not exists (
  select 1 from public.simulado_roles r
  where r.tenant_id = t.id and r.nome = 'professor'
);

-- 3) Vínculos papel→permissão do professor, por tenant
--    (simulado_role_permissions: PK(role_id, permission_id)).
--    Escopo coerente: conteúdo/materiais/biblioteca/flashcards/trilhas/classificação +
--    produtos/liberação, espelhando admin_conteudo e estendendo às áreas novas.
--    SEM rbac/auditoria/tenants/console/configurações/integrações/api_keys/gamificação/
--    armazenamento/correção (não é admin geral).
insert into public.simulado_role_permissions (role_id, permission_id)
select r.id, p.id
from public.simulado_roles r
join public.simulado_permissions p
  on (p.resource, p.action) in (
    ('questoes', 'view'), ('questoes', 'create'), ('questoes', 'update'),
    ('simulados', 'view'), ('simulados', 'create'), ('simulados', 'update'), ('simulados', 'delete'),
    ('biblioteca', 'view'), ('biblioteca', 'create'), ('biblioteca', 'update'), ('biblioteca', 'publicar'),
    ('leitura', 'view'), ('leitura', 'create'), ('leitura', 'update'), ('leitura', 'publicar'),
    ('flashcards', 'view'), ('flashcards', 'create'), ('flashcards', 'update'), ('flashcards', 'manage'),
    ('trilhas', 'view'), ('trilhas', 'create'), ('trilhas', 'update'), ('trilhas', 'manage'),
    ('classificacao', 'view'), ('classificacao', 'manage'),
    ('produtos', 'view'), ('produtos', 'create'), ('produtos', 'update'), ('produtos', 'manage'),
    ('liberacao', 'view'), ('liberacao', 'manage'),
    ('grupos', 'view'),
    ('estudantes', 'view'),
    ('matriculas', 'view'),
    ('relatorios', 'view')
  )
where r.nome = 'professor'
on conflict (role_id, permission_id) do nothing;

-- Após aplicar: NOTIFY pgrst, 'reload schema';
