-- "Leitura rápida": progresso PERSISTIDO do caminho alternativo (leitura + questões num HTML isolado).
-- O HTML roda num iframe sandbox (sem same-origin → sem localStorage), então a plataforma guarda aqui
-- as respostas marcadas para o aluno poder SAIR e VOLTAR (retomar de onde parou) e para saber quando
-- TODAS as questões foram feitas. Ao completar, o app marca concluido_em e credita XP/sequência/ranking
-- (mesmo motor do desafio) — ver app/api/leitura/rapida/route.ts.
-- respostas jsonb: { "<questao>": { "alternativa": "C", "correta": true }, ... }
create table if not exists simulado_leitura_rapida_progresso (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  estudante_id uuid not null,
  documento_id uuid not null,
  respostas    jsonb not null default '{}'::jsonb,
  respondidas  int not null default 0,
  total        int not null default 0,
  acertos      int not null default 0,
  concluido_em timestamptz,
  atualizado_em timestamptz not null default now(),
  unique (estudante_id, documento_id)
);

create index if not exists idx_leitura_rapida_prog_doc on simulado_leitura_rapida_progresso (tenant_id, documento_id);
create index if not exists idx_leitura_rapida_prog_aluno on simulado_leitura_rapida_progresso (estudante_id);

alter table simulado_leitura_rapida_progresso enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_leitura_rapida_progresso' and policyname='leitura_rapida_prog_tenant') then
    create policy leitura_rapida_prog_tenant on simulado_leitura_rapida_progresso
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- PostgREST: recarregar o schema cache para a tabela nova ficar visível de imediato.
notify pgrst, 'reload schema';
