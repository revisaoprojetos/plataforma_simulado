-- MEUS CADERNOS (aluno) — FASE 2: TAGS por notebook + vínculo página<->tag.
-- ADITIVA e IDEMPOTENTE. Depende de 20261127000000_caderno_onenote_fase1.sql (notebook, páginas, notebook_checa_dono, user_tenant_ids).
-- Acesso real: rotas /api/aluno/notebook/* com service role + checagem de dono/tenant (RLS é a 2ª barreira).

-- ---------------------------------------------------------------- 1) tags (por notebook)
create table if not exists public.simulado_aluno_notebook_tags (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  notebook_id   uuid not null references public.simulado_aluno_notebook (id) on delete cascade,
  estudante_id  uuid not null,
  nome          text not null check (char_length(nome) between 1 and 40),
  cor           text not null default 'primaria' check (cor ~ '^[a-z0-9_-]{1,20}$'),  -- chave de paleta (nunca hex)
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
-- nome único por notebook, sem diferenciar maiúsculas
create unique index if not exists uq_nb_tags_nome on public.simulado_aluno_notebook_tags (notebook_id, lower(nome));
create index if not exists idx_nb_tags_estudante on public.simulado_aluno_notebook_tags (tenant_id, estudante_id);

-- ---------------------------------------------------------------- 2) página <-> tag
create table if not exists public.simulado_aluno_notebook_pagina_tags (
  pagina_id     uuid not null references public.simulado_aluno_notebook_paginas (id) on delete cascade,
  tag_id        uuid not null references public.simulado_aluno_notebook_tags (id) on delete cascade,
  tenant_id     uuid not null,
  estudante_id  uuid not null,
  criado_em     timestamptz not null default now(),
  primary key (pagina_id, tag_id)
);
create index if not exists idx_nb_pagina_tags_tag on public.simulado_aluno_notebook_pagina_tags (tag_id, pagina_id);
create index if not exists idx_nb_pagina_tags_estudante on public.simulado_aluno_notebook_pagina_tags (tenant_id, estudante_id);

-- ---------------------------------------------------------------- triggers
drop trigger if exists trg_simulado_aluno_notebook_tags_atualizado on public.simulado_aluno_notebook_tags;
create trigger trg_simulado_aluno_notebook_tags_atualizado before update on public.simulado_aluno_notebook_tags
  for each row execute function public.notebook_touch_atualizado_em();

drop trigger if exists trg_simulado_aluno_notebook_tags_dono on public.simulado_aluno_notebook_tags;
create trigger trg_simulado_aluno_notebook_tags_dono before insert on public.simulado_aluno_notebook_tags
  for each row execute function public.notebook_checa_dono();

-- integridade: página e tag do MESMO notebook/tenant/estudante
create or replace function public.notebook_pagina_tag_checa() returns trigger
language plpgsql as $$
declare p record; t record;
begin
  select tenant_id, estudante_id, notebook_id into p from public.simulado_aluno_notebook_paginas where id = new.pagina_id;
  select tenant_id, estudante_id, notebook_id into t from public.simulado_aluno_notebook_tags where id = new.tag_id;
  if p.notebook_id is null or t.notebook_id is null or p.notebook_id <> t.notebook_id
     or p.tenant_id <> new.tenant_id or p.estudante_id <> new.estudante_id
     or t.tenant_id <> new.tenant_id or t.estudante_id <> new.estudante_id then
    raise exception 'página/tag de outro notebook, tenant ou estudante' using errcode = '23514';
  end if;
  return new;
end $$;
drop trigger if exists trg_nb_pagina_tags_checa on public.simulado_aluno_notebook_pagina_tags;
create trigger trg_nb_pagina_tags_checa before insert on public.simulado_aluno_notebook_pagina_tags
  for each row execute function public.notebook_pagina_tag_checa();

-- ---------------------------------------------------------------- RLS (padrão do projeto) + grants
do $$
declare t text;
begin
  foreach t in array array['simulado_aluno_notebook_tags','simulado_aluno_notebook_pagina_tags'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "tenant isolation %1$s" on public.%1$s', t);
    execute format('create policy "tenant isolation %1$s" on public.%1$s for all to authenticated
                    using (tenant_id in (select public.user_tenant_ids()))
                    with check (tenant_id in (select public.user_tenant_ids()))', t);
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
