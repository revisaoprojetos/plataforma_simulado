-- MEUS CADERNOS (aluno) — OneNote: RPCs ATÔMICAS (mover bloco, normalizar níveis), busca com trecho no banco e cota/limpeza de arquivos.
-- ADITIVA e IDEMPOTENTE (create or replace / if not exists). Depende de 20261127000000 e 20261129000000 (coluna `nivel`).
-- O CÓDIGO TOLERA A AUSÊNCIA desta migração: cada RPC é chamada primeiro e, se não existir (PGRST202 / 42883), cai no caminho antigo
-- (UPDATEs sequenciais / select do texto / sem cota / sem limpeza de storage). Aplicar manualmente (o dono aplica as migrações).
--
-- SEGURANÇA: todas as funções são SECURITY DEFINER com search_path fixo e filtram tenant_id + estudante_id DENTRO da função
-- (o parâmetro vem do servidor, da sessão do aluno — nunca do cliente). EXECUTE só para service_role (revogado de public/anon/authenticated),
-- porque o padrão do projeto é acesso via service role nas rotas /api/aluno/notebook/*.
-- Após aplicar: notify pgrst, 'reload schema' (no fim do arquivo).

-- ---------------------------------------------------------------- 1) normalizar níveis (atômico, com versao++)
-- Regra (espelha lib/aluno/notebook-arvore.ts normalizarNiveis): nivel[0] = 0; nivel[i] <= nivel[i-1] + 1; 0..2.
create or replace function public.notebook_normalizar_niveis(p_tenant uuid, p_estudante uuid, p_secao uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r      record;
  v_prev integer := null;
  v_novo integer;
  v_n    integer := 0;
begin
  perform 1 from public.simulado_aluno_notebook_secoes
   where id = p_secao and tenant_id = p_tenant and estudante_id = p_estudante
   for update;                                   -- serializa operações concorrentes na mesma seção
  if not found then return 0; end if;

  for r in
    select id, nivel from public.simulado_aluno_notebook_paginas
     where secao_id = p_secao and tenant_id = p_tenant and estudante_id = p_estudante and deletado_em is null
     order by ordem, id
     for update
  loop
    v_novo := case when v_prev is null then 0 else greatest(0, least(coalesce(r.nivel, 0), v_prev + 1, 2)) end;
    if v_novo <> coalesce(r.nivel, 0) then
      update public.simulado_aluno_notebook_paginas set nivel = v_novo, versao = versao + 1 where id = r.id;
      v_n := v_n + 1;
    end if;
    v_prev := v_novo;
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------- 2) mover bloco (uma transação)
-- p_ids/p_ordens/p_niveis: páginas a atualizar (o bloco movido e, se houve renumeração, os demais da seção destino); nível < 0 = manter.
-- p_ids_bloco: páginas que MUDAM de seção para p_secao_destino (vazio = reordenação dentro da mesma seção).
-- Erros: P0002 (seção/página não pertence ao aluno) -> a rota responde 404; 22023 (argumentos inválidos / seção automática) -> 400.
create or replace function public.notebook_mover_bloco(
  p_tenant uuid, p_estudante uuid, p_secao_origem uuid, p_secao_destino uuid,
  p_ids uuid[], p_ordens double precision[], p_niveis integer[], p_ids_bloco uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n    integer;
  v_cont integer;
  v_qtd  integer := coalesce(array_length(p_ids, 1), 0);
begin
  if v_qtd = 0 or v_qtd > 2100
     or v_qtd <> coalesce(array_length(p_ordens, 1), -1)
     or v_qtd <> coalesce(array_length(p_niveis, 1), -1) then
    raise exception 'argumentos inconsistentes' using errcode = '22023';
  end if;

  -- trava as seções do aluno (origem e destino) em ordem determinística (evita deadlock)
  perform 1 from public.simulado_aluno_notebook_secoes
   where id in (p_secao_origem, p_secao_destino) and tenant_id = p_tenant and estudante_id = p_estudante and deletado_em is null
   order by id for update;
  get diagnostics v_cont = row_count;
  if v_cont <> (case when p_secao_origem = p_secao_destino then 1 else 2 end) then
    raise exception 'secao nao encontrada' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.simulado_aluno_notebook_secoes where id = p_secao_destino and tipo like 'auto\_%') then
    raise exception 'secao automatica nao aceita paginas' using errcode = '22023';
  end if;

  -- todas as páginas são do aluno, vivas, e estão na origem ou no destino
  select count(*) into v_cont from public.simulado_aluno_notebook_paginas
   where id = any (p_ids) and tenant_id = p_tenant and estudante_id = p_estudante and deletado_em is null
     and secao_id in (p_secao_origem, p_secao_destino);
  if v_cont <> v_qtd then
    raise exception 'pagina nao encontrada' using errcode = 'P0002';
  end if;

  update public.simulado_aluno_notebook_paginas p
     set ordem    = d.ordem,
         secao_id = case when p.id = any (coalesce(p_ids_bloco, '{}')) then p_secao_destino else p.secao_id end,
         nivel    = case when d.nivel >= 0 then d.nivel else p.nivel end,
         versao   = case when d.nivel >= 0 and d.nivel <> p.nivel then p.versao + 1 else p.versao end
    from unnest(p_ids, p_ordens, p_niveis) as d(id, ordem, nivel)
   where p.id = d.id and p.tenant_id = p_tenant and p.estudante_id = p_estudante and p.deletado_em is null;
  get diagnostics v_n = row_count;

  perform public.notebook_normalizar_niveis(p_tenant, p_estudante, p_secao_destino);
  if p_secao_origem <> p_secao_destino then
    perform public.notebook_normalizar_niveis(p_tenant, p_estudante, p_secao_origem);
  end if;
  return v_n;
end $$;

-- ---------------------------------------------------------------- 3) busca com trecho calculado no banco
-- Evita trafegar texto_busca (até 200 KB) × 30 páginas: só o trecho (~180 chars) sai do banco. Espelha trechoBusca() do servidor.
create or replace function public.notebook_buscar(
  p_tenant uuid, p_estudante uuid, p_q text, p_secao uuid, p_offset integer, p_limit integer
)
returns table (id uuid, secao_id uuid, titulo text, trecho text, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  with q as (select websearch_to_tsquery('portuguese'::regconfig, coalesce(p_q, '')) as tsq),
  base as (
    select p.id, p.secao_id, p.titulo, p.atualizado_em,
           btrim(regexp_replace(left(p.texto_busca, 20000), '\s+', ' ', 'g')) as txt,
           count(*) over () as total
      from public.simulado_aluno_notebook_paginas p, q
     where p.tenant_id = p_tenant and p.estudante_id = p_estudante
       and p.deletado_em is null and not p.arquivada
       and (p_secao is null or p.secao_id = p_secao)
       and p.busca @@ q.tsq
     order by p.atualizado_em desc, p.id
     offset greatest(coalesce(p_offset, 0), 0)
     limit least(greatest(coalesce(p_limit, 20), 1), 30)
  )
  select b.id, b.secao_id, b.titulo,
         (case when x.ini > 1 then '…' else '' end) || substr(b.txt, x.ini, 180)
           || (case when x.ini - 1 + 180 < length(b.txt) then '…' else '' end) as trecho,
         b.total
    from base b
    cross join lateral (
      select greatest(coalesce(min(nullif(position(t in lower(b.txt)), 0)), 1) - 50, 1) as ini
        from unnest(string_to_array(lower(btrim(coalesce(p_q, ''))), ' ')) as t
       where length(t) >= 2
    ) x
   order by b.atualizado_em desc, b.id;
$$;

-- ---------------------------------------------------------------- 4) arquivos do caderno: cota por aluno + limpeza na exclusão definitiva
create table if not exists public.simulado_aluno_notebook_arquivos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  estudante_id  uuid not null,
  arquivo       text not null check (arquivo ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.[a-z0-9]{2,5}$'),
  bytes         bigint not null check (bytes >= 0),
  criado_em     timestamptz not null default now(),
  constraint uq_nb_arquivos unique (tenant_id, estudante_id, arquivo)
);
create index if not exists idx_nb_arquivos_estudante on public.simulado_aluno_notebook_arquivos (tenant_id, estudante_id);

alter table public.simulado_aluno_notebook_arquivos enable row level security;
drop policy if exists "tenant isolation simulado_aluno_notebook_arquivos" on public.simulado_aluno_notebook_arquivos;
create policy "tenant isolation simulado_aluno_notebook_arquivos" on public.simulado_aluno_notebook_arquivos for all to authenticated
  using (tenant_id in (select public.user_tenant_ids()))
  with check (tenant_id in (select public.user_tenant_ids()));
grant select, insert, update, delete on public.simulado_aluno_notebook_arquivos to service_role;

-- Dos arquivos informados, devolve os que NENHUMA outra página do aluno referencia (doc ou tinta) — seguros para apagar do storage.
create or replace function public.notebook_arquivos_orfaos(p_tenant uuid, p_estudante uuid, p_arquivos text[], p_excluir uuid)
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(a), '{}')
    from unnest(case when coalesce(cardinality(p_arquivos), 0) <= 200 then p_arquivos else '{}'::text[] end) as a
   where not exists (
     select 1 from public.simulado_aluno_notebook_paginas p
      where p.tenant_id = p_tenant and p.estudante_id = p_estudante and p.id <> p_excluir
        and (position(a in p.doc::text) > 0 or position(a in coalesce(p.tinta::text, '')) > 0)
   );
$$;

-- ---------------------------------------------------------------- permissões das funções (somente service_role)
do $$
declare f text;
begin
  foreach f in array array[
    'public.notebook_normalizar_niveis(uuid, uuid, uuid)',
    'public.notebook_mover_bloco(uuid, uuid, uuid, uuid, uuid[], double precision[], integer[], uuid[])',
    'public.notebook_buscar(uuid, uuid, text, uuid, integer, integer)',
    'public.notebook_arquivos_orfaos(uuid, uuid, text[], uuid)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
