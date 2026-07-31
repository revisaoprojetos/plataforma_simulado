-- ============================================================================
-- RBAC — Deduplicação de simulado_permissions + constraint UNIQUE(resource, action)
--
-- Contexto: a base migrada acumulou duplicatas em simulado_permissions
-- (101 linhas para 28 chaves reais resource:action). A exibição já dedupa na
-- leitura, mas os vínculos simulado_role_permissions.permission_id apontam para
-- várias dessas duplicatas (129/162), então NÃO dá para apenas deletar: é preciso
-- repontar os vínculos para o id canônico antes de remover as duplicatas.
--
-- Estratégia (atômica, em transação):
--   1. Escolhe o id canônico por (resource, action) = min(id).
--   2. Reconstrói simulado_role_permissions apontando para o canônico, com DISTINCT
--      (elimina pares repetidos role_id+permission_id sem depender de constraint).
--   3. Remove as permissions duplicadas (não-canônicas), agora sem referências.
--   4. Cria UNIQUE(resource, action) para impedir recorrência.
--
-- Idempotente o suficiente: se já não houver duplicatas, os DELETEs são no-op e o
-- ADD CONSTRAINT falha só se a constraint já existir (rode uma vez).
-- ============================================================================

BEGIN;

-- Mapa canônico: 1 id por (resource, action).
-- min() não existe para uuid nesta instância → escolhe o canônico pelo menor uuid
-- em texto (determinístico). keep_id volta a ser uuid.
CREATE TEMP TABLE _canon ON COMMIT DROP AS
SELECT resource, action, min(id::text)::uuid AS keep_id
FROM public.simulado_permissions
GROUP BY resource, action;

-- 1+2) Reconstrói os vínculos apontando para o canônico, sem pares repetidos.
CREATE TEMP TABLE _rp_new ON COMMIT DROP AS
SELECT DISTINCT rp.role_id, c.keep_id AS permission_id
FROM public.simulado_role_permissions rp
JOIN public.simulado_permissions p ON p.id = rp.permission_id
JOIN _canon c ON c.resource = p.resource AND c.action = p.action;

DELETE FROM public.simulado_role_permissions;
INSERT INTO public.simulado_role_permissions (role_id, permission_id)
SELECT role_id, permission_id FROM _rp_new;

-- 3) Remove as permissions duplicadas (mantém o canônico) — já sem referências.
DELETE FROM public.simulado_permissions p
USING _canon c
WHERE p.resource = c.resource AND p.action = c.action AND p.id <> c.keep_id;

-- 4) Impede novas duplicatas.
ALTER TABLE public.simulado_permissions
  ADD CONSTRAINT simulado_permissions_resource_action_key UNIQUE (resource, action);

COMMIT;
