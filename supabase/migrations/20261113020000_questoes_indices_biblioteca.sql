-- BIBLIOTECA › QUESTÕES (banco): índices que faltavam para a árvore/lista por taxonomia.
--  • simulado_alternativas(questao_id): a FK não tinha índice → contar/juntar alternativas varria a tabela inteira.
--  • simulado_questoes(tenant_id, disciplina_id, assunto_id) WHERE NOT deletado: árvore Disciplina › Assunto e filtros do nó.
--  • simulado_questao_etiquetas(etiqueta_id): árvore/filtro por etiqueta.
-- Idempotente. NÃO aplicado automaticamente — o usuário aplica. A tela funciona sem eles (só mais lenta ao ordenar por "Alt.").
create index if not exists idx_alternativas_questao on simulado_alternativas (questao_id);
create index if not exists idx_questoes_tenant_disc_ass on simulado_questoes (tenant_id, disciplina_id, assunto_id) where deletado = false;
create index if not exists idx_questao_etiquetas_etiqueta on simulado_questao_etiquetas (etiqueta_id);
