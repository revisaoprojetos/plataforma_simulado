-- Biblioteca de Conteúdos: separa DUAS coleções na mesma infra (docx + OnlyOffice + Drive):
--   'conteudo'      → materiais de leitura
--   'modelo_caderno'→ MODELOS DE CADERNO em docx, editados 100% no OnlyOffice (NÃO é o construtor de
--                     blocos antigo de simulado_caderno_modelos — este vive na Biblioteca).
-- Aditiva e idempotente. Pastas usam simulado_pastas.folder_area: 'conteudo' e 'conteudo_modelo'.

alter table public.simulado_conteudo_documentos
  add column if not exists categoria text not null default 'conteudo';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'simulado_conteudo_doc_categoria_chk') then
    alter table public.simulado_conteudo_documentos
      add constraint simulado_conteudo_doc_categoria_chk check (categoria in ('conteudo','modelo_caderno'));
  end if;
end $$;

create index if not exists idx_conteudo_doc_categoria
  on public.simulado_conteudo_documentos (tenant_id, categoria, status) where deletado = false;

notify pgrst, 'reload schema';
