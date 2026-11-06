-- ÁREAS DE VISIBILIDADE dentro de documentos da Biblioteca (.docx marcado pelo plugin "Áreas de visibilidade").
-- O .docx traz parágrafos-marcador `[[AREA:<id>|<Nome>]]` ... `[[/AREA:<id>]]`; o servidor sincroniza as áreas ao
-- salvar e remove (texto e PDF) o que o aluno não pode ver. Regras editáveis por produto / grupo / segmento / aluno.
-- Leitura tolerante no código: sem estas tabelas, nenhum documento tem área e nada muda para o aluno.

create table if not exists public.simulado_conteudo_areas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  documento_id  uuid not null,
  area_key      text not null,                       -- id gravado no docx (8 chars)
  nome          text not null default '',
  ordem         int  not null default 0,
  presente      boolean not null default true,       -- false = sumiu do docx na última edição (regras preservadas)
  expansiva     boolean not null default false,      -- true = no modo texto vira bloco recolhível (título = nome da área)
  tipo          text not null default 'area',        -- 'area' (visibilidade) | 'exp' (bloco expansível do plugin Expansor)
  preset        text,                                -- preset de cores do bloco expansível vindo do marcador [[EXP:id|Título|preset]]
  titulo        text,                                -- título editado no admin (NULL = nome vindo do documento)
  estilo        jsonb,                               -- override de estilo do bloco expansível (NULL = padrão do tenant)
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (documento_id, area_key)
);
create index if not exists idx_conteudo_areas_doc on public.simulado_conteudo_areas (tenant_id, documento_id);

create table if not exists public.simulado_conteudo_area_regras (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  documento_id  uuid not null,
  area_key      text not null,
  efeito        text not null check (efeito in ('mostrar','ocultar')),
  produto_id    uuid,                                -- NULL = vale em qualquer lugar (inclui Biblioteca direta)
  publico_tipo  text not null default 'todos' check (publico_tipo in ('todos','segmento','grupo','aluno')),
  publico_id    uuid,                                -- segmento / grupo / aluno (NULL quando 'todos')
  ativo         boolean not null default true,
  ordem         int  not null default 0,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_conteudo_area_regras_doc on public.simulado_conteudo_area_regras (tenant_id, documento_id) where ativo = true;

alter table public.simulado_conteudo_areas enable row level security;
alter table public.simulado_conteudo_area_regras enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_conteudo_areas' and policyname='conteudo_areas_tenant') then
    create policy conteudo_areas_tenant on public.simulado_conteudo_areas
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_conteudo_area_regras' and policyname='conteudo_area_regras_tenant') then
    create policy conteudo_area_regras_tenant on public.simulado_conteudo_area_regras
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

notify pgrst, 'reload schema';
