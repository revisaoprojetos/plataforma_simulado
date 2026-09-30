-- Agregação do NPS no banco (evita puxar TODAS as avaliações pro app pra contar). Devolve 1 linha
-- com total + promotores/neutros/detratores + soma (p/ a média). Os comentários recentes são lidos
-- à parte (limit 40). Só cria se a tabela existir (NPS é opcional por tenant).
do $$ begin
  if to_regclass('public.simulado_avaliacoes') is not null then
    create or replace function public.rpc_nps_resumo(p_tenant uuid)
    returns table(total bigint, promotores bigint, neutros bigint, detratores bigint, soma bigint)
    language sql stable as $fn$
      select count(*)::bigint,
             count(*) filter (where nps >= 9)::bigint,
             count(*) filter (where nps between 7 and 8)::bigint,
             count(*) filter (where nps <= 6)::bigint,
             coalesce(sum(nps), 0)::bigint
      from public.simulado_avaliacoes
      where tenant_id = p_tenant;
    $fn$;
  end if;
end $$;
