-- MEUS CADERNOS (aluno) — modelo OneNote, FASE 1: 1 notebook por aluno -> seções -> páginas (doc TipTap/ProseMirror JSON).
-- ADITIVA e IDEMPOTENTE. NÃO altera/apaga simulado_aluno_cadernos / _questoes / _itens / _destinos (seguem servindo o leitor até a fase 2).
-- Acesso real: rotas /api/aluno/notebook/* com service role + checagem de dono/tenant (RLS é a 2ª barreira).
-- Contrato: docs/caderno-onenote-contrato.md. Importação dos itens antigos: 20261127010000_caderno_onenote_importar.sql.
-- Após aplicar: notify pgrst, 'reload schema' (já no fim deste arquivo).

-- ---------------------------------------------------------------- função genérica atualizado_em
create or replace function public.notebook_touch_atualizado_em() returns trigger
language plpgsql as $$
begin
  new.atualizado_em := now();
  return new;
end $$;

-- ---------------------------------------------------------------- 1) notebook (1 por estudante+tenant)
create table if not exists public.simulado_aluno_notebook (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  estudante_id  uuid not null,
  titulo        text not null default 'Meu Caderno',
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint uq_notebook_estudante_tenant unique (tenant_id, estudante_id)
);

-- ---------------------------------------------------------------- 2) seções
create table if not exists public.simulado_aluno_notebook_secoes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  notebook_id   uuid not null references public.simulado_aluno_notebook (id) on delete cascade,
  estudante_id  uuid not null,
  nome          text not null check (char_length(nome) between 1 and 120),
  cor           text,                                   -- token/chave de paleta (nunca hex livre no front)
  ordem         double precision not null default 0,    -- reordenação por ponto médio (sem renumerar tudo)
  tipo          text not null default 'manual'
                check (tipo in ('manual','auto_erros','auto_favoritos','importada')),
  origem_tipo   text,                                   -- importação: ex. 'caderno'
  origem_id     uuid,                                   -- importação: id da linha original (dedupe)
  deletado_em   timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint ck_notebook_secao_origem check ((origem_tipo is null) = (origem_id is null))
);
create index if not exists idx_nb_secoes_estudante_ordem
  on public.simulado_aluno_notebook_secoes (estudante_id, notebook_id, ordem) where deletado_em is null;
create index if not exists idx_nb_secoes_tenant on public.simulado_aluno_notebook_secoes (tenant_id);
create unique index if not exists uq_nb_secao_origem
  on public.simulado_aluno_notebook_secoes (notebook_id, origem_tipo, origem_id) where origem_id is not null;
-- seção automática: no máximo 1 por tipo por notebook (cor/ordem personalizáveis; conteúdo é calculado)
create unique index if not exists uq_nb_secao_auto
  on public.simulado_aluno_notebook_secoes (notebook_id, tipo) where tipo like 'auto\_%';

-- ---------------------------------------------------------------- 3) páginas
create table if not exists public.simulado_aluno_notebook_paginas (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  notebook_id     uuid not null references public.simulado_aluno_notebook (id) on delete cascade,
  secao_id        uuid not null references public.simulado_aluno_notebook_secoes (id) on delete cascade,
  estudante_id    uuid not null,
  titulo          text not null default 'Sem título' check (char_length(titulo) <= 200),
  tipo_pagina     text not null default 'texto' check (tipo_pagina in ('texto','folha_livre')), -- folha_livre = fase posterior
  doc             jsonb not null default '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb
                  check (pg_column_size(doc) <= 2097152),           -- 2 MB por página
  tinta           jsonb,                                            -- RESERVADO (fase posterior: camada de caneta)
  texto_busca     text not null default '' check (char_length(texto_busca) <= 200000),
                                                                    -- texto plano extraído do doc NO SERVIDOR a cada save
  busca           tsvector generated always as (
                    setweight(to_tsvector('portuguese'::regconfig, coalesce(titulo, '')), 'A') ||
                    setweight(to_tsvector('portuguese'::regconfig, coalesce(texto_busca, '')), 'B')
                  ) stored,
  versao          int not null default 1,                           -- controle otimista (PATCH exige a versão lida)
  ordem           double precision not null default 0,
  arquivada       boolean not null default false,
  deletado_em     timestamptz,                                      -- lixeira (purga por job após N dias)
  client_op_id    uuid,                                             -- idempotência da CRIAÇÃO (POST repetido)
  ultimo_op_id    uuid,                                             -- idempotência do ÚLTIMO save aplicado (PATCH repetido)
  origem_tipo     text,                                             -- importação: 'caderno_questoes'|'caderno_item'|...
  origem_id       uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint ck_notebook_pagina_origem check ((origem_tipo is null) = (origem_id is null))
);
-- árvore: páginas de uma seção, em ordem, só as vivas
create index if not exists idx_nb_paginas_secao_ordem
  on public.simulado_aluno_notebook_paginas (estudante_id, secao_id, ordem)
  where deletado_em is null and not arquivada;
create index if not exists idx_nb_paginas_tenant on public.simulado_aluno_notebook_paginas (tenant_id);
-- lixeira
create index if not exists idx_nb_paginas_lixeira
  on public.simulado_aluno_notebook_paginas (estudante_id, deletado_em desc) where deletado_em is not null;
-- busca full-text
create index if not exists idx_nb_paginas_busca on public.simulado_aluno_notebook_paginas using gin (busca);
-- idempotência
create unique index if not exists uq_nb_pagina_client_op
  on public.simulado_aluno_notebook_paginas (notebook_id, client_op_id) where client_op_id is not null;
create unique index if not exists uq_nb_pagina_origem
  on public.simulado_aluno_notebook_paginas (notebook_id, origem_tipo, origem_id) where origem_id is not null;

-- ---------------------------------------------------------------- triggers atualizado_em
do $$
declare t text;
begin
  foreach t in array array['simulado_aluno_notebook','simulado_aluno_notebook_secoes','simulado_aluno_notebook_paginas'] loop
    execute format('drop trigger if exists trg_%1$s_atualizado on public.%1$s', t);
    execute format('create trigger trg_%1$s_atualizado before update on public.%1$s
                    for each row execute function public.notebook_touch_atualizado_em()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- integridade: seção/página no mesmo tenant+estudante do notebook
create or replace function public.notebook_checa_dono() returns trigger
language plpgsql as $$
declare n record;
begin
  select tenant_id, estudante_id into n from public.simulado_aluno_notebook where id = new.notebook_id;
  if not found or n.tenant_id <> new.tenant_id or n.estudante_id <> new.estudante_id then
    raise exception 'notebook de outro tenant/estudante' using errcode = '23514';
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['simulado_aluno_notebook_secoes','simulado_aluno_notebook_paginas'] loop
    execute format('drop trigger if exists trg_%1$s_dono on public.%1$s', t);
    execute format('create trigger trg_%1$s_dono before insert on public.%1$s
                    for each row execute function public.notebook_checa_dono()', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- RLS (padrão do projeto) + grants
do $$
declare t text;
begin
  foreach t in array array['simulado_aluno_notebook','simulado_aluno_notebook_secoes','simulado_aluno_notebook_paginas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "tenant isolation %1$s" on public.%1$s', t);
    execute format('create policy "tenant isolation %1$s" on public.%1$s for all to authenticated
                    using (tenant_id in (select public.user_tenant_ids()))
                    with check (tenant_id in (select public.user_tenant_ids()))', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
