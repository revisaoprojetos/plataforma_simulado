-- DÚVIDAS & REQUERIMENTOS (eixo b) — Central de atendimento do aluno.
-- Decisões do produto: Dúvidas = conversa PRIVADA 1:1 aluno↔professor (base pública/KB fica p/ fase seguinte);
-- lado ADMIN construído junto (responder + status). Requerimentos = pedido administrativo com protocolo RQ.
-- RLS por tenant igual ao restante (ver 20261013000000_leitura_rapida_progresso.sql).

-- ─────────────────────────── 1) Dúvidas (thread) ───────────────────────────
create table if not exists simulado_duvidas (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  estudante_id  uuid not null,                       -- autor (dono da conversa)
  titulo        text not null,                       -- a pergunta (título da thread)
  categoria     text,                                -- matéria/tema livre (ex.: "Administrativo")
  disciplina_id uuid,                                -- vínculo opcional à taxonomia (simulado_disciplinas)
  origem        jsonb not null default '{}'::jsonb,  -- {tipo: 'pdf'|'aula'|'questao'|'geral', ref?, label?, pagina?}
  status        text not null default 'aberta',      -- 'aberta' | 'respondida' | 'resolvida'
  resolvida_em  timestamptz,
  ultima_msg_em timestamptz not null default now(),  -- p/ ordenar a lista por atividade
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_duvidas_aluno  on simulado_duvidas (tenant_id, estudante_id, ultima_msg_em desc);
create index if not exists idx_duvidas_status on simulado_duvidas (tenant_id, status, ultima_msg_em desc);

alter table simulado_duvidas enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_duvidas' and policyname='duvidas_tenant') then
    create policy duvidas_tenant on simulado_duvidas
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- ─────────────────────────── 2) Mensagens da dúvida ───────────────────────────
create table if not exists simulado_duvida_mensagens (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null,
  duvida_id   uuid not null references simulado_duvidas(id) on delete cascade,
  autor_tipo  text not null,                         -- 'aluno' | 'professor'
  autor_id    uuid,                                  -- user id (aluno ou admin que respondeu)
  autor_nome  text,                                  -- nome exibido (ex.: "Professor(a) de Administrativo")
  texto       text not null,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_duvida_msg on simulado_duvida_mensagens (tenant_id, duvida_id, criado_em);

alter table simulado_duvida_mensagens enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_duvida_mensagens' and policyname='duvida_msg_tenant') then
    create policy duvida_msg_tenant on simulado_duvida_mensagens
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- ─────────────────────────── 3) Requerimentos ───────────────────────────
create table if not exists simulado_requerimentos (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  estudante_id  uuid not null,
  protocolo     text not null,                       -- "RQ-#####" (único por tenant)
  tipo          text not null,                       -- um dos tipos fixos (ver lib/requerimentos/tipos.ts)
  descricao     text not null,
  contexto      text,                                -- curso/turma/período informado pelo aluno
  status        text not null default 'em_analise',  -- 'em_analise' | 'concluido' | 'indeferido'
  resposta      text,                                -- resposta da equipe
  respondido_por uuid,
  respondido_em timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (tenant_id, protocolo)
);

create index if not exists idx_req_aluno  on simulado_requerimentos (tenant_id, estudante_id, criado_em desc);
create index if not exists idx_req_status on simulado_requerimentos (tenant_id, status, criado_em desc);

alter table simulado_requerimentos enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_requerimentos' and policyname='requerimentos_tenant') then
    create policy requerimentos_tenant on simulado_requerimentos
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- PostgREST: recarregar o schema cache para as tabelas novas ficarem visíveis de imediato.
notify pgrst, 'reload schema';
