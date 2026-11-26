-- =====================================================================================================================
-- 08-contagens-e-grupos — funções contagens_bancos_wizard, pastas_com_estudantes, simulado_grupos_contagem (origem 20261203000000 + 20261204000000)
-- Projeto alvo: twdrtlxkjvunkdobudev (SQL Editor do Supabase). Cole numa ABA NOVA e rode inteiro (o Editor já usa transação).
-- Idempotente. Sem CONCURRENTLY/VACUUM. Risco: BAIXO (só funções)
-- Ver LEIAME.md (ordem, verificação).
-- =====================================================================================================================
SET LOCAL lock_timeout = '15s';

-- Otimizações de contagem (reduz N+1 em simulado_pasta_estudantes / simulado_questao_pasta). Idempotente; só funções.
-- Contagem de questões e estudantes por banco/pasta em UMA chamada (antes: 2 HEAD counts por pasta).
create or replace function public.contagens_bancos_wizard(p_tenant uuid, p_pastas uuid[])
returns table (pasta_id uuid, questoes bigint, estudantes bigint)
language sql stable
as $$
  select p.id as pasta_id,
         coalesce((select count(*) from public.simulado_questao_pasta qp where qp.tenant_id = p_tenant and qp.pasta_id = p.id), 0) as questoes,
         coalesce((select count(*) from public.simulado_pasta_estudantes pe where pe.tenant_id = p_tenant and pe.pasta_id = p.id), 0) as estudantes
    from unnest(p_pastas) as p(id);
$$;

-- Pastas (dentre as informadas) que têm >=1 estudante atribuído (distinto; sem trazer linhas).
create or replace function public.pastas_com_estudantes(p_tenant uuid, p_pastas uuid[])
returns table (pasta_id uuid)
language sql stable
as $$
  select p.id
    from unnest(p_pastas) as p(id)
   where exists (select 1 from public.simulado_pasta_estudantes pe where pe.tenant_id = p_tenant and pe.pasta_id = p.id);
$$;

grant execute on function public.contagens_bancos_wizard(uuid, uuid[]) to service_role, authenticated;
grant execute on function public.pastas_com_estudantes(uuid, uuid[]) to service_role, authenticated;

-- Contagem de membros por grupo (GROUP BY no banco) — evita varrer todas as filiações do tenant.
-- Usada por lib/simulado/grupos.ts (contarMembrosGrupos) via service role; fallback no código se ausente.
create or replace function public.simulado_grupos_contagem(p_tenant uuid)
returns table (grupo_id uuid, total integer)
language sql
stable
security invoker
set search_path = public
as $$
  select m.grupo_id, count(*)::int as total
    from public.simulado_grupo_membros m
   where m.tenant_id = p_tenant
   group by m.grupo_id
$$;
revoke all on function public.simulado_grupos_contagem(uuid) from public, anon, authenticated;
grant execute on function public.simulado_grupos_contagem(uuid) to service_role;

NOTIFY pgrst, 'reload schema';
