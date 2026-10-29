-- Cronograma Adaptativo: liga o conteúdo da Biblioteca às metas do método (PDFull/PDFight/LegProc/Questões)
-- por TIPO DE MATERIAL da SUBpasta. Uma pasta-DISCIPLINA (com disciplina_id) pode ter várias subpastas,
-- cada uma marcada com seu tipo. Os documentos de cada subpasta entram como o material daquele tipo da
-- disciplina. Herança: um documento herda o tipo da subpasta-tipada mais próxima subindo a árvore.
--   'pdfull' | 'pdfight' -> aula nova (AS / meta pf)
--   'legproc'            -> lei seca por semana (WLP)
--   'questoes'           -> reservado (por ora não entra como aula; não gera meta nova)
--   null                 -> não configurada (docs soltos na pasta-disciplina caem como pdfull, p/ compat.)
-- Código tolerante à ausência da coluna (feature dormente até aplicar).
alter table simulado_pastas add column if not exists cronograma_tipo_material text;

-- Sem índice: a coluna é lida junto com a projeção das pastas de conteúdo
-- (filtro por tenant_id + folder_area), não é predicado de filtro — índice seria morto.

notify pgrst, 'reload schema';
