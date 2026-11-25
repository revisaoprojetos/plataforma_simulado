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
