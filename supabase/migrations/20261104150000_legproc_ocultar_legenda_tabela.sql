-- LegProc (leitura em texto): a TABELA DE LEGENDA que abre cada documento ("LEGENDA: AMARELO = núcleo…") repete a
-- barra de legendas do leitor. Por padrão ela fica OCULTA para o aluno; estas colunas deixam o admin MOSTRAR (false)
-- ou ocultar (true) por PASTA e por DOCUMENTO. null = herda (documento → pasta → ancestrais → padrão: oculta).
-- Leitura tolerante no código: enquanto as colunas não existirem, vale o padrão (oculta).
alter table public.simulado_pastas
  add column if not exists legproc_ocultar_legenda boolean;
alter table public.simulado_conteudo_documentos
  add column if not exists legproc_ocultar_legenda boolean;

notify pgrst, 'reload schema';
