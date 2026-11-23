-- MEUS CADERNOS (aluno) — OneNote: DESEMPENHO do servidor (auditoria). ADITIVA e IDEMPOTENTE.
-- O CÓDIGO TOLERA A AUSÊNCIA desta migração: cada RPC é chamada primeiro e, se não existir (PGRST202 / 42883), cai no caminho antigo
-- (baixar respostas / count exact por seção). Aplicar manualmente no SQL editor (roda em transação: índices SEM `concurrently`).
-- SEGURANÇA: SECURITY DEFINER, search_path fixo, filtram tenant_id + estudante_id DENTRO da função; EXECUTE só para service_role.

-- ---------------------------------------------------------------- índices
-- Última resposta por questão (distinct on) do aluno no tenant.
create index if not exists idx_rav_tenant_est_questao_resp
  on public.simulado_respostas_avulsas (tenant_id, estudante_id, questao_id, respondido_em desc);

-- Consultas quentes da árvore/ordem filtram só `deletado_em is null` (a coluna `arquivada` é filtrada depois).
create index if not exists idx_nb_paginas_secao_ordem_vivas
  on public.simulado_aluno_notebook_paginas (estudante_id, secao_id, ordem, id) where deletado_em is null;

-- ---------------------------------------------------------------- 1) contar "Meus erros" (última resposta errada)
create or replace function public.notebook_contar_erros(p_tenant uuid, p_estudante uuid)
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint from (
    select distinct on (questao_id) questao_id, correta
      from public.simulado_respostas_avulsas
     where tenant_id = p_tenant and estudante_id = p_estudante
     order by questao_id, respondido_em desc, id asc
  ) u
  where not u.correta;
$$;

-- ---------------------------------------------------------------- 2) listar "Meus erros" paginado (mais recente primeiro) + total
-- `total` repete em cada linha (count(*) over() antes do offset/limit). Página vazia => 0 linhas (o código recorre a notebook_contar_erros).
create or replace function public.notebook_listar_erros(p_tenant uuid, p_estudante uuid, p_offset integer, p_limit integer)
returns table (questao_id uuid, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with ult as (
    select distinct on (r.questao_id) r.questao_id, r.correta, r.respondido_em
      from public.simulado_respostas_avulsas r
     where r.tenant_id = p_tenant and r.estudante_id = p_estudante
     order by r.questao_id, r.respondido_em desc, r.id asc
  )
  select e.questao_id, (count(*) over ())::bigint as total
    from ult e
   where not e.correta
   order by e.respondido_em desc, e.questao_id
  offset greatest(coalesce(p_offset, 0), 0)
   limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

-- ---------------------------------------------------------------- 3) páginas vivas e não arquivadas por seção (UMA consulta)
create or replace function public.notebook_contar_paginas(p_tenant uuid, p_estudante uuid)
returns table (secao_id uuid, qtd bigint)
language sql
stable
security definer
set search_path = public
as $$
  select p.secao_id, count(*)::bigint
    from public.simulado_aluno_notebook_paginas p
   where p.tenant_id = p_tenant and p.estudante_id = p_estudante and p.deletado_em is null and p.arquivada = false
   group by p.secao_id;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.notebook_contar_erros(uuid, uuid)',
    'public.notebook_listar_erros(uuid, uuid, integer, integer)',
    'public.notebook_contar_paginas(uuid, uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
