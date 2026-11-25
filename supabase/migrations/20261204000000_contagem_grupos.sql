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
