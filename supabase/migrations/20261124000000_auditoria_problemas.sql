-- AUDITORIA DE PROBLEMAS (painel interativo em /admin/auditoria/problemas).
--
-- Versão viva do documento docs/AUDITORIA-PROBLEMAS.md, SEPARADA POR TENANT (cada plataforma tem a sua).
--   auditoria_problemas            — um registro por problema (status, área, prazo, prioridade, responsável…), com soft-delete.
--   auditoria_problemas_historico  — quem mudou o quê (antes/depois), imutável (só insert).
--   auditoria_problemas_resumo()   — KPIs/distribuições agregados NO BANCO (a tela só lê).
--
-- Leitura tolerante no app: sem estas tabelas a página mostra "migração pendente". Aplicar: pnpm migracoes aplicar 20261124000000

create table if not exists public.auditoria_problemas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  area           text not null check (area in ('cronograma','liberacao','biblioteca','simulados','curseduca','infra','migracoes')),
  assunto        text not null,
  razao          text,                                  -- "Razão do problema"
  acao           text,                                  -- "Ação para correção"
  status         text not null default 'aberto' check (status in ('aberto','em_andamento','resolvido')),
  prioridade     text not null default 'media' check (prioridade in ('baixa','media','alta','critica')),
  -- Ordem numérica da prioridade (ordenação correta no servidor: alfabética daria alta < baixa < critica).
  prioridade_ord smallint generated always as (
    case prioridade when 'baixa' then 1 when 'media' then 2 when 'alta' then 3 else 4 end
  ) stored,
  prazo          date,                                  -- prazo de correção (ou data de conclusão, se resolvido)
  prazo_texto    text,                                  -- prazo sem data ("Próximo cpi", "Sem prazo…")
  data_registro  date not null default current_date,    -- "Data" do documento
  versao         text,                                  -- "Versão" do documento (ex.: 4.21.0)
  relator        text,                                  -- quem relatou
  responsavel    text,                                  -- quem resolve
  origem         text not null default 'manual',        -- manual | importacao_md | …
  resolvido_em   timestamptz,
  criado_por     uuid,
  atualizado_por uuid,
  deleted_at     timestamptz,                           -- soft-delete
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

create index if not exists idx_aud_prob_tenant_status on public.auditoria_problemas (tenant_id, status) where deleted_at is null;
create index if not exists idx_aud_prob_tenant_area   on public.auditoria_problemas (tenant_id, area)   where deleted_at is null;
create index if not exists idx_aud_prob_prazo         on public.auditoria_problemas (tenant_id, prazo)   where deleted_at is null and status <> 'resolvido';

create table if not exists public.auditoria_problemas_historico (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  problema_id uuid not null references public.auditoria_problemas(id) on delete cascade,
  ator_id     uuid,
  acao        text not null check (acao in ('criado','editado','status','excluido','restaurado','importado')),
  antes       jsonb,
  depois      jsonb,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_aud_prob_hist_problema on public.auditoria_problemas_historico (problema_id, criado_em desc);
create index if not exists idx_aud_prob_hist_tenant   on public.auditoria_problemas_historico (tenant_id, criado_em desc);

do $$
declare t text;
begin
  foreach t in array array['auditoria_problemas','auditoria_problemas_historico'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "tenant_isolation_%s" on public.%I', t, t);
    execute format('create policy "tenant_isolation_%s" on public.%I for all to authenticated
      using (tenant_id in (select public.user_tenant_ids()))
      with check (tenant_id in (select public.user_tenant_ids()))', t, t);
    execute format('grant all on public.%I to authenticated', t);
    execute format('grant all on public.%I to service_role', t);
  end loop;
end $$;

-- KPIs e distribuições agregados no banco. `p_hoje` = data de hoje em Brasília (vem do app).
create or replace function public.auditoria_problemas_resumo(p_tenant uuid, p_hoje date)
returns jsonb
language sql
stable
as $$
  with p as (
    select * from public.auditoria_problemas where tenant_id = p_tenant and deleted_at is null
  )
  select jsonb_build_object(
    'total',        (select count(*) from p),
    'abertos',      (select count(*) from p where status = 'aberto'),
    'em_andamento', (select count(*) from p where status = 'em_andamento'),
    'resolvidos',   (select count(*) from p where status = 'resolvido'),
    'atrasados',    (select count(*) from p where status <> 'resolvido' and prazo is not null and prazo < p_hoje),
    'resolvidos_30d', (select count(*) from p where status = 'resolvido' and coalesce(resolvido_em::date, prazo, data_registro) >= p_hoje - 30),
    'por_area',     coalesce((select jsonb_agg(jsonb_build_object('area', area, 'status', status, 'total', n) order by area, status)
                              from (select area, status, count(*) n from p group by area, status) x), '[]'::jsonb),
    'por_prioridade', coalesce((select jsonb_agg(jsonb_build_object('prioridade', prioridade, 'total', n))
                              from (select prioridade, count(*) n from p where status <> 'resolvido' group by prioridade) x), '[]'::jsonb),
    'proximos',     coalesce((select jsonb_agg(to_jsonb(y) order by y.prazo)
                              from (select id, assunto, area, status, prioridade, prazo, responsavel
                                      from p where status <> 'resolvido' and prazo is not null
                                     order by prazo asc, id asc limit 8) y), '[]'::jsonb)
  );
$$;

grant execute on function public.auditoria_problemas_resumo(uuid, date) to authenticated, service_role;

notify pgrst, 'reload schema';
