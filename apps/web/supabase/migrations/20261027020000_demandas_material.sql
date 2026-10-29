-- DEMANDAS (eixo c / Admin Fase D) — reportes de problema + avaliações (0–5) de MATERIAL (Leitor).
-- Spec AUDITORIA.md §6/§8: a Central de Dúvidas tem "demandas (reportes e avaliações)";
-- reportes e avaliações de 1–2 estrelas entram na fila "Precisa de você". Admin em /admin/atendimento.
-- RLS por tenant igual ao restante (ver 20261013000000_leitura_rapida_progresso.sql).

-- ─────────────────────────── 1) Reportes de problema no material ───────────────────────────
create table if not exists simulado_material_reportes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  estudante_id  uuid not null,
  documento_id  uuid not null,                       -- material da Biblioteca (simulado_conteudo_documentos.id)
  versao_id     uuid,                                -- versão vigente quando reportado (opcional)
  pagina        int,                                 -- página/trecho (opcional)
  tipo          text not null default 'outro',       -- 'erro_conteudo'|'erro_tecnico'|'desatualizado'|'outro'
  descricao     text not null,
  status        text not null default 'aberto',      -- 'aberto'|'em_analise'|'resolvido'
  resposta      text,
  resolvido_por uuid,
  resolvido_em  timestamptz,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create index if not exists idx_mat_reporte_status on simulado_material_reportes (tenant_id, status, criado_em desc);
create index if not exists idx_mat_reporte_doc    on simulado_material_reportes (tenant_id, documento_id);
create index if not exists idx_mat_reporte_aluno  on simulado_material_reportes (tenant_id, estudante_id);

alter table simulado_material_reportes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_material_reportes' and policyname='mat_reporte_tenant') then
    create policy mat_reporte_tenant on simulado_material_reportes
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- ─────────────────────────── 2) Avaliações (0–5) do material ───────────────────────────
-- Uma avaliação por aluno+material (upsert). 1–2 estrelas sobem para a fila "Precisa de você".
create table if not exists simulado_material_avaliacoes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  estudante_id  uuid not null,
  documento_id  uuid not null,
  nota          int  not null,                       -- 1..5
  comentario    text,
  criado_em     timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (estudante_id, documento_id)
);

create index if not exists idx_mat_aval_doc   on simulado_material_avaliacoes (tenant_id, documento_id);
create index if not exists idx_mat_aval_baixa on simulado_material_avaliacoes (tenant_id, nota, criado_em desc);

alter table simulado_material_avaliacoes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_material_avaliacoes' and policyname='mat_aval_tenant') then
    create policy mat_aval_tenant on simulado_material_avaliacoes
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- PostgREST: recarregar o schema cache para as tabelas novas ficarem visíveis de imediato.
notify pgrst, 'reload schema';
