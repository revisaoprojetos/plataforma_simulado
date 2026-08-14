-- Marcador de questão ANULADA no BANCO (nível questão, global ao tenant).
-- Diferente de `simulado_prova_questoes.anulada`, que é por-simulado: esta coluna
-- registra a intenção "esta questão está anulada" (ex.: veio como ANULADA na
-- planilha de importação). A partir dela, a anulação é PROPAGADA para cada
-- `simulado_prova_questoes` que usa a questão (via re-correção, política
-- pontua_todos — todos ganham o ponto, ninguém perde nota), e novos simulados
-- montados a partir do banco já herdam `prova_questoes.anulada = true`.
-- Código é tolerante à ausência da coluna (default false), então pode subir antes.

alter table simulado_questoes
  add column if not exists anulada boolean not null default false;
