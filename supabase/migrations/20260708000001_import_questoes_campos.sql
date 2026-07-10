-- Campos extras para o modelo de importação de questões.
-- Banca/Órgão/Disciplina/Assunto Principal -> taxonomia existente (banca_id/orgao_id/disciplina_id/assunto_id).
-- Novos campos livres na questão e por alternativa (Lei/Comentário).

alter table simulado_questoes
  add column if not exists numero text,
  add column if not exists grupo text,
  add column if not exists categoria text,
  add column if not exists assunto_detalhe text,
  add column if not exists pilar_1 text,
  add column if not exists pilar_2 text,
  add column if not exists cargo text;

alter table simulado_alternativas
  add column if not exists lei text,
  add column if not exists comentario text;
