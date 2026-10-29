-- NOVIDADES ("O que mudou") — changelog/anúncios publicáveis por tenant, com estado "lida" por aluno.
-- Alimenta o card de Novidades da Início nova (filtro por categoria, destaque, "marcar tudo como lido").
-- RLS por tenant igual ao restante (ver 20261013000000_leitura_rapida_progresso.sql).

create table if not exists simulado_novidades (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  categoria     text not null default 'plataforma',  -- bbb | plataforma | cursos | materiais | jurisclub | outro
  titulo        text not null,
  descricao     text,
  destaque      boolean not null default false,       -- item em destaque (capa + 2 CTAs)
  cover_url     text,
  cta_label     text, cta_url  text,
  cta2_label    text, cta2_url text,
  publicado_em  timestamptz not null default now(),
  ativo         boolean not null default true,
  criado_por    uuid,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_novidades_tenant on simulado_novidades (tenant_id, ativo, publicado_em desc);

alter table simulado_novidades enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_novidades' and policyname='novidades_tenant') then
    create policy novidades_tenant on simulado_novidades
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- Estado "lida" por aluno+novidade (upsert).
create table if not exists simulado_novidade_leituras (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  estudante_id uuid not null,
  novidade_id  uuid not null references simulado_novidades(id) on delete cascade,
  lida_em      timestamptz not null default now(),
  unique (estudante_id, novidade_id)
);

create index if not exists idx_novidade_leitura_aluno on simulado_novidade_leituras (tenant_id, estudante_id);

alter table simulado_novidade_leituras enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_novidade_leituras' and policyname='novidade_leitura_tenant') then
    create policy novidade_leitura_tenant on simulado_novidade_leituras
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- Seed inicial (dados REAIS) para cada tenant — o admin edita/remove depois. Só insere se o tenant
-- ainda não tem nenhuma novidade (idempotente em re-run).
insert into simulado_novidades (tenant_id, categoria, titulo, descricao, destaque, cta_label, cta_url, cta2_label, cta2_url, publicado_em)
select t.id, 'bbb',
  'Episódio 00: a plataforma do Revisão está em obra, e você participa',
  'Acompanhe a construção ao vivo, vote nas próximas funcionalidades e teste antes de todo mundo.',
  true, 'Assistir o episódio 00', '#', 'Votar na próxima funcionalidade', '#', now()
from simulado_tenants t
where not exists (select 1 from simulado_novidades n where n.tenant_id = t.id);

insert into simulado_novidades (tenant_id, categoria, titulo, descricao, destaque, cta_label, cta_url, publicado_em)
select t.id, 'plataforma', 'Simulados com nova página inicial',
  'Banners, nível, sequência, missões do dia e a Maratona ENAP + AGU em um só lugar.',
  false, 'Ver agora', '/aluno/nova/inicio', now()
from simulado_tenants t
where (select count(*) from simulado_novidades n where n.tenant_id = t.id) = 1;

insert into simulado_novidades (tenant_id, categoria, titulo, descricao, destaque, cta_label, cta_url, publicado_em)
select t.id, 'materiais', 'LegProc: CF art. 37 com grifos do Revisão e modo lacunas',
  'Leitura por assunto, ligada às aulas do Extensivo.',
  false, 'Ver agora', '/aluno/nova/cursos/central/legproc', now() - interval '1 day'
from simulado_tenants t
where (select count(*) from simulado_novidades n where n.tenant_id = t.id) = 2;

insert into simulado_novidades (tenant_id, categoria, titulo, descricao, destaque, cta_label, cta_url, publicado_em)
select t.id, 'jurisclub', 'Caderno de agosto/2026 completo',
  '78 julgados comentados, com teste rápido e vade mecum.',
  false, 'Ver agora', '/aluno/nova/cursos/central/jurisclub', now() - interval '3 days'
from simulado_tenants t
where (select count(*) from simulado_novidades n where n.tenant_id = t.id) = 3;

-- PostgREST: recarregar o schema cache.
notify pgrst, 'reload schema';
