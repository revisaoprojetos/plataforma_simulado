-- Documento MARCADO COMO LEGPROC (Biblioteca): o leitor do aluno abre em modo TEXTO (em vez do PDF fiel)
-- com os blocos de ENTENDIMENTO do STF e do STJ RECOLHÍVEIS/expansíveis (mesmo comportamento do leitor
-- da Lei Seca do Desafio). Default false = comportamento atual (PDF) inalterado. Leitura tolerante no código:
-- enquanto a coluna não existir, o leitor trata como false.
alter table public.simulado_conteudo_documentos
  add column if not exists leitura_legproc boolean not null default false;

notify pgrst, 'reload schema';
