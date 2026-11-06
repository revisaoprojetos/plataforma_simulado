-- BIBLIOTECA › METADADOS dos conteúdos (colunas/filtros da lista + import/export de planilha).
-- Um jsonb por documento com: disciplina, assunto_especifico, tribunal, informativo, ano (número),
-- estado_origem (UF). Zero tabela nova: vive no próprio simulado_conteudo_documentos. A "data de
-- atualização" exibida na lista é o `atualizado_em` que já existe (o import de planilha o atualiza
-- quando um metadado muda).
--
-- Aditiva e idempotente. NÃO aplicar automaticamente; aplicar manualmente e rodar:
--   NOTIFY pgrst, 'reload schema';
-- Sem esta migração a Biblioteca segue funcionando (a leitura de metadados é tolerante); só o
-- import de planilha avisa para aplicá-la.

alter table simulado_conteudo_documentos
  add column if not exists metadados jsonb not null default '{}'::jsonb;

notify pgrst, 'reload schema';
