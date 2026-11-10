-- GERENCIADOR DE VÍDEO PRÓPRIO (integração com o serviço services/video) — Fase 3.
-- ADITIVA e IDEMPOTENTE. NÃO aplicada automaticamente: revisar e rodar no SQL Editor.
-- Leitura tolerante no código: sem estas tabelas o provedor "Vídeo próprio" fica indisponível e nada mais muda.
--
--   video_empresas          tenant nosso  <->  empresa (tenant) do serviço de vídeo (slug) + trava de habilitação
--   video_cursos            "curso" do serviço (unidade de matrícula) <-> produto do catálogo (ou acervo do tenant)
--   video_aulas             nossa aula de vídeo  <->  lessonId/videoId do serviço + status do processamento
--   video_matriculas_sync   fila/estado da sincronização de acesso (enroll/revoke) por regra+aluno+curso

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) video_empresas
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.video_empresas (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  slug                text not null,                       -- slug da empresa no serviço (= slug do tenant por padrão, D6)
  ativo               boolean not null default false,      -- trava nossa (piloto): false => playback/sync respondem "indisponível"
  acesso_habilitado   boolean not null default false,      -- espelha accessEndpointEnabled da empresa no serviço (informativo)
  observacao          text,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (tenant_id)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) video_cursos
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.video_cursos (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  course_id           uuid not null,                       -- courseId no serviço
  module_id           uuid,                                -- módulo padrão onde as aulas são criadas
  produto_id          uuid,                                -- produto do catálogo (simulado_produtos); NULL = acervo do tenant
  titulo              text not null default 'Acervo',
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  unique (tenant_id, course_id)
);
-- no máximo 1 acervo (produto NULL) por tenant e 1 curso por produto.
create unique index if not exists uq_video_cursos_acervo on public.video_cursos (tenant_id) where produto_id is null;
create unique index if not exists uq_video_cursos_produto on public.video_cursos (tenant_id, produto_id) where produto_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) video_aulas
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.video_aulas (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null,
  curso_id            uuid not null references public.video_cursos(id) on delete restrict,
  titulo              text not null,
  pasta_id            uuid,                                -- pasta/organização livre do Estúdio (sem FK: pastas variam por área)
  ordem               int  not null default 0,
  lesson_id           uuid not null,                       -- lessonId no serviço
  video_id            uuid,                                -- videoId no serviço (NULL até iniciar o upload)
  status              text not null default 'rascunho'
                      check (status in ('rascunho','enviando','processando','pronta','erro','excluida')),
  duracao_s           double precision,
  erro                text,
  criado_por          uuid,
  criado_em           timestamptz not null default now(),
  atualizado_em       timestamptz not null default now(),
  deletado_em         timestamptz,
  unique (tenant_id, lesson_id)
);
create index if not exists idx_video_aulas_lista   on public.video_aulas (tenant_id, status, criado_em desc) where deletado_em is null;
create index if not exists idx_video_aulas_ordem   on public.video_aulas (tenant_id, curso_id, ordem) where deletado_em is null;
create index if not exists idx_video_aulas_video   on public.video_aulas (video_id) where video_id is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) video_matriculas_sync  (fila + estado; 1 linha por regra+aluno+curso; idempotente)
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists public.video_matriculas_sync (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  regra_id              uuid not null,                     -- regra de liberação (ou produto_id quando o grant não tem regra)
  estudante_id          uuid not null,
  curso_id              uuid not null references public.video_cursos(id) on delete cascade,
  external_ref          text not null,                     -- "regra_id:aluno_id" (idempotência no serviço)
  acao                  text not null check (acao in ('enroll','revoke')),
  estado                text not null default 'pendente'
                        check (estado in ('pendente','processando','sincronizado','falhou')),
  inicio_em             timestamptz,                       -- NULL = sem início
  fim_em                timestamptz,                       -- NULL = sem limite
  tentativas            int  not null default 0,
  proxima_tentativa_em  timestamptz not null default now(),
  ultimo_erro           text,
  enrollment_id         uuid,                              -- enrollmentId devolvido pelo serviço
  sincronizado_em       timestamptz,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  unique (tenant_id, regra_id, estudante_id, curso_id)
);
-- fila: só o que está esperando/processando (índice parcial pequeno).
create index if not exists idx_video_sync_fila   on public.video_matriculas_sync (proxima_tentativa_em, id)
  where estado in ('pendente','processando');
-- gate do aluno e reconciliação.
create index if not exists idx_video_sync_acesso on public.video_matriculas_sync (tenant_id, estudante_id, curso_id)
  where acao = 'enroll' and estado = 'sincronizado';
create index if not exists idx_video_sync_curso  on public.video_matriculas_sync (tenant_id, curso_id, estado);
create index if not exists idx_video_sync_falhas on public.video_matriculas_sync (tenant_id, atualizado_em desc)
  where estado = 'falhou';

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RLS por tenant (mesmo padrão das migrations recentes; o app usa service role + filtro explícito)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.video_empresas        enable row level security;
alter table public.video_cursos          enable row level security;
alter table public.video_aulas           enable row level security;
alter table public.video_matriculas_sync enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_empresas' and policyname='video_empresas_tenant') then
    create policy video_empresas_tenant on public.video_empresas
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_cursos' and policyname='video_cursos_tenant') then
    create policy video_cursos_tenant on public.video_cursos
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_aulas' and policyname='video_aulas_tenant') then
    create policy video_aulas_tenant on public.video_aulas
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='video_matriculas_sync' and policyname='video_matriculas_sync_tenant') then
    create policy video_matriculas_sync_tenant on public.video_matriculas_sync
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Permissões novas (RBAC) — o catálogo no app (lib/rbac-catalogo.ts) ganha video:view / video:manage
--    (patch em docs/video/INTEGRACAO-LIBERACAO.md). Admin/super-admin já passam por accessCan sem linha aqui.
-- ─────────────────────────────────────────────────────────────────────────────

notify pgrst, 'reload schema';
