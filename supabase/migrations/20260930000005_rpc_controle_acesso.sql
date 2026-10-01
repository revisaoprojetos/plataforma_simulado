-- Controle de acesso do módulo em UMA linha (jsonb): todos os alunos com acesso (membros dos grupos
-- vinculados + individuais), já com o(s) grupo(s) de cada um. 1 query/agregação no banco, sem o teto
-- de 1000 do PostgREST (um módulo pode ter dezenas de milhares de alunos via grupos).
create or replace function public.rpc_controle_acesso_json(p_tenant uuid, p_pasta uuid)
returns jsonb language sql stable as $$
  with grp as (
    select g.id, g.nome, g.cor
    from public.simulado_pasta_grupos pg
    join public.simulado_grupos g on g.id = pg.grupo_id and g.tenant_id = p_tenant
    where pg.pasta_id = p_pasta and pg.tenant_id = p_tenant
  ),
  mem as (
    select m.estudante_id,
           jsonb_agg(distinct jsonb_build_object('id', grp.id, 'nome', grp.nome, 'cor', grp.cor)) as grupos
    from public.simulado_grupo_membros m
    join grp on grp.id = m.grupo_id
    where m.tenant_id = p_tenant
    group by m.estudante_id
  ),
  ind as (
    select estudante_id from public.simulado_pasta_estudantes
    where pasta_id = p_pasta and tenant_id = p_tenant
  ),
  ids as (
    select estudante_id from mem
    union
    select estudante_id from ind
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'nome', e.nome, 'email', e.email, 'cpf', e.cpf, 'classificacao', e.classificacao,
    'avatar', e.avatar, 'perfil_avatar_cor', e.perfil_avatar_cor,
    'grupos', coalesce(mem.grupos, '[]'::jsonb),
    'individual', (ind.estudante_id is not null)
  ) order by e.nome), '[]'::jsonb)
  from ids
  join public.simulado_estudantes e
    on e.id = ids.estudante_id and e.tenant_id = p_tenant and coalesce(e.deletado, false) = false
  left join mem on mem.estudante_id = ids.estudante_id
  left join ind on ind.estudante_id = ids.estudante_id;
$$;
