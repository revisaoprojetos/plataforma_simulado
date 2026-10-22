-- GRIFOS do aluno sobre o PDF FIEL da Biblioteca (visualização pixel-perfeita = o mesmo PDF do editor).
-- Ancorados por (página + retângulos normalizados 0..1), independentes de zoom. Por aluno; nunca apagados
-- por atualização do documento (sobrevivem; a nova versão só muda o PDF). Separado das anotações de TEXTO
-- (simulado_conteudo_anotacoes) para não interferir na reconciliação por uid.
create table if not exists public.simulado_conteudo_grifos_pdf (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  documento_id uuid not null references public.simulado_conteudo_documentos(id) on delete cascade,
  versao_id uuid,
  aluno_id uuid not null,
  pagina int not null,
  rects jsonb not null default '[]'::jsonb,   -- [{x0,y0,x1,y1}] normalizados 0..1 na página
  cor text not null default 'y',
  tool text not null default 'hl',           -- hl (marca-texto) | ul | wv | st | bx (ferramenta do grifo)
  nota text,                                 -- anotação opcional ligada ao grifo (aba Notas do caderno)
  texto text,
  criado_em timestamptz not null default now()
);

create index if not exists idx_grifos_pdf_doc_aluno on public.simulado_conteudo_grifos_pdf (tenant_id, documento_id, aluno_id);

alter table public.simulado_conteudo_grifos_pdf enable row level security;
drop policy if exists tenant_isolation on public.simulado_conteudo_grifos_pdf;
create policy tenant_isolation on public.simulado_conteudo_grifos_pdf
  using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

notify pgrst, 'reload schema';
