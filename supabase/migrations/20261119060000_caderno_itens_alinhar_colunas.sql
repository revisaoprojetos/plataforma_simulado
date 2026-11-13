-- MEUS CADERNOS — alinha simulado_aluno_caderno_itens (tabela JÁ existente, formato antigo: grifo_id, texto_marcado,
-- nota, documento_titulo, tool…) ao que o código novo grava/lê (grifo_ref, trecho, comentario, prefix, suffix, inicio,
-- fim, documento_versao, titulo_documento) e permite tipo 'comentario'. As migrações 20261105000000 e 20261119040000
-- não surtiram efeito nessas colunas porque usam `create table if not exists` sobre a tabela antiga.
-- ADITIVA e IDEMPOTENTE: não remove nem altera colunas antigas.

alter table simulado_aluno_caderno_itens add column if not exists documento_versao int;
alter table simulado_aluno_caderno_itens add column if not exists titulo_documento text;
alter table simulado_aluno_caderno_itens add column if not exists trecho           text;
alter table simulado_aluno_caderno_itens add column if not exists prefix           text;
alter table simulado_aluno_caderno_itens add column if not exists suffix           text;
alter table simulado_aluno_caderno_itens add column if not exists inicio           int;
alter table simulado_aluno_caderno_itens add column if not exists fim              int;
alter table simulado_aluno_caderno_itens add column if not exists comentario       text;
alter table simulado_aluno_caderno_itens add column if not exists grifo_ref        text;

-- tipo: passa a aceitar 'comentario' (mantém 'questao','grifo','anotacao').
alter table simulado_aluno_caderno_itens drop constraint if exists simulado_aluno_caderno_itens_tipo_check;
alter table simulado_aluno_caderno_itens add constraint simulado_aluno_caderno_itens_tipo_check
  check (tipo in ('questao','grifo','anotacao','comentario'));

-- dedupe por caderno (idempotência do salvar)
create unique index if not exists uq_caderno_item_grifo_ref
  on simulado_aluno_caderno_itens (caderno_id, grifo_ref) where grifo_ref is not null;

notify pgrst, 'reload schema';
