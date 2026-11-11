-- ============================================================================
-- PLATAFORMA REVISÃO › Montagem de curso › CURSOS (protótipo admin-plataforma-revisao: #cursos / #curso / #novocurso)
--
-- Um "curso" do protótipo é uma CAMADA DE MONTAGEM acima dos produtos do Estúdio:
--   curso 1—N produtos (simulado_produtos) · grupos de acesso = itens tipo 'grupo' dos produtos do curso
--   (nenhuma tabela nova para grupos: reusa simulado_produto_itens) · currículo = módulos/itens do produto
--   principal (simulado_produto_modulos / _modulo_itens) · pasta = simulado_pastas folder_area='produto'.
-- Aqui entram só as tabelas NOVAS: o curso em si, o vínculo curso↔produtos, pop-ups do curso, automações
-- (mensagens WhatsApp + e-mails automáticos) do curso, e as duas tabelas do Passaporte/edital.
--
-- NÃO aplicar automaticamente. Aplicar manualmente e rodar: NOTIFY pgrst, 'reload schema';
-- Idempotente. RLS por tenant_id (padrão trilhas): o app usa service role, que bypassa.
-- ============================================================================

-- ─────────────────────────── 1) Curso ───────────────────────────
create table if not exists public.simulado_cursos (
  id                    uuid primary key default gen_random_uuid(),
  tenant_id             uuid not null,
  nome                  text not null,
  sub                   text,                                   -- "Frase de apoio"
  tipo                  text not null default 'Curso',          -- Extensivo|Curso|Sprint|Reta final|Prova oral|Discursiva|Turma
  ativo                 boolean not null default false,         -- visível para os alunos (sincroniza simulado_produtos.ativo)
  modelo                text not null default 'trilha',         -- trilha|materia|contagem|semana|temas|material|agenda
  cfg                   jsonb not null default '{}'::jsonb,     -- ajustes do modelo {lib,prova,semanas,inicio,banca,abas[],progresso,gravacao,lembrete,semana_a_semana}
  blk                   jsonb not null default '["Avisos do professor","Simulados do curso"]'::jsonb, -- blocos extras
  cor_principal         text not null default '#2E2150',
  cor_destaque          text not null default '#E5B230',
  img_horizontal        text,                                   -- capa 1280x720
  img_vertical          text,                                   -- capa 600x900
  img_banner            text,                                   -- banner do topo 1600x400
  galeria               jsonb not null default '[]'::jsonb,     -- urls p/ pop-ups, avisos e e-mails
  abre_em               date,
  fecha_em              date,
  cronograma_adaptativo boolean not null default true,          -- aulas entram no Cronograma Adaptativo
  pasta_id              uuid,                                   -- simulado_pastas (folder_area='produto')
  produto_id            uuid,                                   -- produto PRINCIPAL (currículo/vitrine/"Ver como aluno")
  trilha_id             uuid,                                   -- simulado_trilhas criada automaticamente (etapa 4)
  etapas                jsonb not null default '{}'::jsonb,     -- passo a passo {prodOk,pad{capa,coment,cert,marca},sprint,pastaPass,gOk,vitrine,sem1,guia,wa,pub}
  edital                jsonb not null default '{}'::jsonb,     -- Passaporte e edital {pass,orgao,pub,prova,modos[],peso,min,max,final,volta}
  msg_cfg               jsonb not null default '{}'::jsonb,     -- conexão de mensagens {prov,num,con} (a CHAVE do serviço fica no servidor, nunca aqui)
  criado_por            uuid,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  deletado              boolean not null default false,
  deletado_em           timestamptz,
  deletado_por          uuid
);
create index if not exists idx_cursos_tenant on public.simulado_cursos (tenant_id, deletado, ativo);
create index if not exists idx_cursos_produto on public.simulado_cursos (produto_id);

-- ─────────────────────────── 2) Curso ↔ produtos (etapa 2) ───────────────────────────
create table if not exists public.simulado_curso_produtos (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  curso_id    uuid not null references public.simulado_cursos(id) on delete cascade,
  produto_id  uuid not null,
  ordem       int not null default 0,
  criado_em   timestamptz not null default now(),
  unique (curso_id, produto_id)
);
create index if not exists idx_curso_produtos on public.simulado_curso_produtos (tenant_id, curso_id, ordem);

-- ─────────────────────────── 3) Pop-ups do curso ───────────────────────────
create table if not exists public.simulado_curso_popups (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  curso_id    uuid not null references public.simulado_cursos(id) on delete cascade,
  titulo      text not null,
  texto       text,
  botao_texto text,
  botao_link  text,
  quando      text not null default 'No primeiro acesso ao curso', -- primeiro acesso | toda vez | ao concluir aula | data e hora
  frequencia  text not null default 'Uma vez por aluno',           -- uma vez por aluno | por dia | sempre
  no_ar_de    date,
  no_ar_ate   date,
  imagem_url  text,
  ativo       boolean not null default true,
  criado_por  uuid,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_curso_popups on public.simulado_curso_popups (tenant_id, curso_id, criado_em desc);

-- ─────────────────────────── 4) Automações do curso (WhatsApp + e-mail) ───────────────────────────
-- canal='whatsapp': chaves boas|meta|sim|mat|venc  ·  canal='email': boas|mat|ev|sem|venc|fim.
-- Linha ausente = padrão do sistema (texto de fábrica, ligado/desligado conforme o protótipo).
create table if not exists public.simulado_curso_automacoes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  curso_id      uuid not null references public.simulado_cursos(id) on delete cascade,
  canal         text not null check (canal in ('whatsapp','email')),
  chave         text not null,
  ativo         boolean,
  assunto       text,
  texto         text,
  atualizado_em timestamptz not null default now(),
  unique (curso_id, canal, chave)
);

-- ─────────────────────────── 5) Passaporte e edital ───────────────────────────
-- Escolha do aluno do Passaporte sobre como estudar para o edital do curso.
create table if not exists public.simulado_curso_edital_escolhas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  curso_id      uuid not null references public.simulado_cursos(id) on delete cascade,
  estudante_id  uuid not null,
  escolha       text not null check (escolha in ('conciliar','seguir','curso')),
  criado_em     timestamptz not null default now(),
  unique (curso_id, estudante_id)
);
create index if not exists idx_edital_escolhas on public.simulado_curso_edital_escolhas (tenant_id, curso_id, escolha);

-- Aulas do Extensivo (submódulos de simulado_produto_modulos) que cobrem o edital.
create table if not exists public.simulado_curso_edital_aulas (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  curso_id    uuid not null references public.simulado_cursos(id) on delete cascade,
  modulo_id   uuid not null,
  criado_em   timestamptz not null default now(),
  unique (curso_id, modulo_id)
);
create index if not exists idx_edital_aulas on public.simulado_curso_edital_aulas (tenant_id, curso_id);

-- ─────────────────────────── RLS por tenant ───────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'simulado_cursos','simulado_curso_produtos','simulado_curso_popups',
    'simulado_curso_automacoes','simulado_curso_edital_escolhas','simulado_curso_edital_aulas'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=t and policyname=t || '_tenant') then
      execute format($p$create policy %I on public.%I
        using (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
        with check (tenant_id = current_setting('app.current_tenant_id', true)::uuid);$p$, t || '_tenant', t);
    end if;
  end loop;
end $$;

-- Soft delete: incluir 'simulado_cursos' em SOFT_DELETE_TABELAS (lib/soft-delete.ts) se quiser Lixeira.

notify pgrst, 'reload schema';
