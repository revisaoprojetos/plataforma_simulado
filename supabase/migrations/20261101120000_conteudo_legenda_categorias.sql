-- Toggle POR DOCUMENTO (Biblioteca) para mostrar a legenda de CATEGORIAS do leitor
-- (Núcleo/Complemento/Prazos/crucial/exceção/STF/STJ/Equipe). Essa legenda é específica do LegProc e
-- NÃO se aplica a PDFULL/Fight/etc., então nasce DESLIGADA (false). O admin religa por documento quando
-- fizer sentido. Leitura é tolerante: enquanto a coluna não existir, o leitor trata como false (oculta).
alter table public.simulado_conteudo_documentos
  add column if not exists legenda_categorias boolean not null default false;
