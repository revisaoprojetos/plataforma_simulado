-- #8 — Relatório de grupos por aluno.
-- Agrega, por estudante, os grupos a que ele pertence, com os MAIS RECENTES primeiro
-- (jsonb_agg ordenado por criado_em desc). Retorna já com o nome do estudante (join) para
-- não precisar de um 2º fetch. Ignora grupos deletados/arquivados e estudantes deletados.
do $$ begin
  if to_regclass('public.simulado_grupo_membros') is not null then
    create or replace function public.rpc_grupos_por_aluno(p_tenant uuid)
    returns table(estudante_id uuid, nome text, total int, ultimo_em timestamptz, grupos jsonb)
    language sql stable as $fn$
      -- Recência = data do vínculo, com fallback p/ a data do grupo (muitos vínculos antigos têm
      -- criado_em nulo; os adicionados recentemente têm data → sobem com nulls last).
      select
        m.estudante_id,
        max(e.nome)                                            as nome,
        count(*)::int                                          as total,
        max(coalesce(m.criado_em, g.criado_em))                as ultimo_em,
        jsonb_agg(
          jsonb_build_object('id', g.id, 'nome', g.nome, 'cor', g.cor,
                             'em', coalesce(m.criado_em, g.criado_em))
          order by coalesce(m.criado_em, g.criado_em) desc nulls last, g.nome
        )                                                      as grupos
      from public.simulado_grupo_membros m
      join public.simulado_grupos g
        on g.id = m.grupo_id and g.tenant_id = p_tenant
       and coalesce(g.deletado, false) = false
       and coalesce(g.arquivado, false) = false
      join public.simulado_estudantes e
        on e.id = m.estudante_id and e.tenant_id = p_tenant
       and coalesce(e.deletado, false) = false
      where m.tenant_id = p_tenant
      group by m.estudante_id;
    $fn$;
  end if;
end $$;
