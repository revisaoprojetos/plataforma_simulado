-- Biblioteca de Conteúdos: 3ª coleção 'jurisclub' (materiais produzidos para o JurisClub), mesma infra de Drive.
-- Pastas usam simulado_pastas.folder_area = 'conteudo_jurisclub'. Documentos: categoria = 'jurisclub'
-- (a Biblioteca do aluno só lê categoria='conteudo' → o JurisClub não vaza para lá; é entregue via produto).
-- Aditiva e idempotente. Aplicação manual no SQL Editor.

alter table public.simulado_conteudo_documentos drop constraint if exists simulado_conteudo_doc_categoria_chk;
alter table public.simulado_conteudo_documentos
  add constraint simulado_conteudo_doc_categoria_chk check (categoria in ('conteudo','modelo_caderno','jurisclub'));

notify pgrst, 'reload schema';
