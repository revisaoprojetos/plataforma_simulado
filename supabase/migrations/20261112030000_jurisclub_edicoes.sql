-- JurisClub (admin "Plataforma Revisão" › Pedagógico › JurisClub): edições do JurisClub Mensal e dias do
-- "1 Ano em 7 Dias" — pastas, passo a passo de 6 etapas e página da edição (8 abas).
-- Modelo: edição → julgados (selos, conferido, ordem) → questões V/F (C/E) → erratas; liberações por parte
-- (leitura, V/F, PDF, caderno, gabarito) e público (todos com JurisClub | grupos).
-- O material de leitura continua na Biblioteca (simulado_conteudo_documentos, categoria='jurisclub'):
-- `documento_id` só LIGA a edição ao documento. As questões podem ir ao banco de Questões (questao_id).
-- Convenções: tenant_id em tudo, RLS por tenant (app usa service role + filtro explícito), soft-delete na edição.
-- Aditiva e idempotente. Aplicação MANUAL no SQL Editor.

create table if not exists public.jurisclub_edicoes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  pasta            text not null check (pasta in ('mensal','1a7d')),   -- 'trim' (Simulado Trimestral) vive no admin de simulados
  titulo           text not null,
  mes_ref          text,                                               -- 'YYYY-MM' (mês de referência / lançado em)
  status           text not null default 'rascunho' check (status in ('rascunho','agendado','publicado')),
  publicar_em      timestamptz,                                        -- agendamento (BRT convertido p/ UTC)
  publicado_em     timestamptz,
  falta            text,                                               -- "o que falta" do rascunho (texto livre)
  cor              text not null default '#1F4E79',                    -- cor do card (escolhida pelo admin: dado, não tema)
  imagem_url       text,
  versao           text not null default 'ambos' check (versao in ('ambos','ess','comp')),
  todos            boolean not null default true,                      -- true = todos os alunos com JurisClub; false = só os grupos
  ordem_julgados   text not null default 'doc' check (ordem_julgados in ('doc','disc','trib')),
  filtros          text[] not null default array['Disciplina','Tribunal','Selos','Interesse da Fazenda','Busca'],
  filtros_auto     jsonb not null default '{"tipo":true,"tema":true,"orgao":true,"votacao":true,"resultado":true,"disp":true,"faz":true}'::jsonb,
  documento_id     uuid,                                               -- Biblioteca (categoria='jurisclub'): o .docx/.html de origem
  questoes_doc_id  uuid,                                               -- Biblioteca: caderno de questões de origem
  pdf_doc_id       uuid,                                               -- Biblioteca: PDF original (download do aluno)
  sem_questoes     boolean not null default false,                     -- "publicar sem questões por enquanto"
  para_banco       boolean not null default true,                      -- mandar as V/F ao banco de Questões (Simulado Trimestral)
  liberacoes       jsonb not null default '{"leitura":true,"vf":false,"pdf":true,"cad":false,"gab":false}'::jsonb,
  avisar_alunos    boolean not null default true,
  destaque_inicio  boolean not null default true,
  preparar_email   boolean not null default false,
  n_julgados       int not null default 0,                             -- denormalizado (recontado pelas actions)
  n_questoes       int not null default 0,
  criado_por       uuid,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  deletado         boolean not null default false
);
create index if not exists idx_jc_edicoes_tenant on public.jurisclub_edicoes (tenant_id, pasta, status) where deletado = false;
create index if not exists idx_jc_edicoes_lista  on public.jurisclub_edicoes (tenant_id, criado_em desc, id) where deletado = false;

create table if not exists public.jurisclub_edicao_grupos (
  edicao_id uuid not null references public.jurisclub_edicoes(id) on delete cascade,
  tenant_id uuid not null,
  grupo_id  uuid not null,                                             -- simulado_grupos (mesmos grupos do admin de simulados)
  primary key (edicao_id, grupo_id)
);
create index if not exists idx_jc_edicao_grupos_tenant on public.jurisclub_edicao_grupos (tenant_id, grupo_id);

create table if not exists public.jurisclub_julgados (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  edicao_id  uuid not null references public.jurisclub_edicoes(id) on delete cascade,
  ordem      int not null default 0,
  titulo     text not null,
  tribunal   text not null default 'STF',
  orgao      text,                                                     -- Plenário, 1ª Turma, Corte Especial…
  disciplina text,
  selos      text[] not null default '{}',                             -- rg|rep|vinc|reaf|sup|nov|fav|desf
  fazenda    boolean not null default false,                           -- interesse da Fazenda
  conferido  boolean not null default false,
  trecho_uid uuid,                                                     -- âncora no documento (Biblioteca), quando extraído dele
  criado_em  timestamptz not null default now()
);
create index if not exists idx_jc_julgados_edicao on public.jurisclub_julgados (edicao_id, ordem, id);

create table if not exists public.jurisclub_questoes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  edicao_id   uuid not null references public.jurisclub_edicoes(id) on delete cascade,
  julgado_id  uuid references public.jurisclub_julgados(id) on delete set null,
  ordem       int not null default 0,
  enunciado   text not null,
  gabarito    text not null check (gabarito in ('C','E')),
  disciplina  text,
  assunto     text,
  comentario  text,
  questao_id  uuid,                                                    -- questão correspondente no banco (após "Mandar ao banco")
  criado_em   timestamptz not null default now()
);
create index if not exists idx_jc_questoes_edicao on public.jurisclub_questoes (edicao_id, ordem, id);

create table if not exists public.jurisclub_erratas (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  edicao_id      uuid not null references public.jurisclub_edicoes(id) on delete cascade,
  julgado_id     uuid references public.jurisclub_julgados(id) on delete set null,
  julgado_titulo text,
  texto          text not null,
  avisou         boolean not null default false,
  novidade_id    uuid,                                                 -- item criado na Central de Atualizações (novidades)
  criado_por     uuid,
  criado_em      timestamptz not null default now()
);
create index if not exists idx_jc_erratas_edicao on public.jurisclub_erratas (edicao_id, criado_em desc);

-- RLS por tenant (mesmo padrão das migrations recentes; o app usa service role + filtro explícito).
alter table public.jurisclub_edicoes       enable row level security;
alter table public.jurisclub_edicao_grupos enable row level security;
alter table public.jurisclub_julgados      enable row level security;
alter table public.jurisclub_questoes      enable row level security;
alter table public.jurisclub_erratas       enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jurisclub_edicoes' and policyname='jurisclub_edicoes_tenant') then
    create policy jurisclub_edicoes_tenant on public.jurisclub_edicoes
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jurisclub_edicao_grupos' and policyname='jurisclub_edicao_grupos_tenant') then
    create policy jurisclub_edicao_grupos_tenant on public.jurisclub_edicao_grupos
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jurisclub_julgados' and policyname='jurisclub_julgados_tenant') then
    create policy jurisclub_julgados_tenant on public.jurisclub_julgados
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jurisclub_questoes' and policyname='jurisclub_questoes_tenant') then
    create policy jurisclub_questoes_tenant on public.jurisclub_questoes
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='jurisclub_erratas' and policyname='jurisclub_erratas_tenant') then
    create policy jurisclub_erratas_tenant on public.jurisclub_erratas
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

notify pgrst, 'reload schema';
