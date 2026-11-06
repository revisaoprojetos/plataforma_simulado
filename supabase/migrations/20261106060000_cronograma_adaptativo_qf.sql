-- CRONOGRAMA ADAPTATIVO › FILTRO DE QUESTÕES DA PLATAFORMA POR META (aula).
-- O admin define, em cada aula do Catálogo de metas, quais questões do banco da plataforma aparecem para
-- aquela meta (disciplinas, assuntos, banca, órgão, ano, dificuldade). O aluno, na meta de questões do
-- cronograma, abre a tela de resolução já com esse filtro aplicado.
--
-- TABELA PRÓPRIA (e não dentro do `dados` do catálogo): o catálogo é VERSIONADO e cada save dele migra os
-- planos de TODOS os alunos no próximo acesso. Ajustar um filtro não deve disparar isso — aqui é só uma
-- linha por (tenant, aula) que se lê/grava sem tocar na versão do catálogo.
--
-- `aula_key` = chave ESTÁVEL da aula (a mesma do catálogo: `d:<docId>`, `t:<disc>|<tema>` ou `c:<id>`),
-- nunca o índice da aula. `filtro` = jsonb { disc[], ass[], banca[], orgao[], anos[], dif[] } com IDs.
--
-- Aditiva e idempotente. NÃO aplicar automaticamente; aplicar manualmente e rodar:
--   NOTIFY pgrst, 'reload schema';
-- Sem esta migração o Cronograma funciona como hoje (a leitura é tolerante); só o admin avisa ao salvar.

create table if not exists simulado_cronograma_adaptativo_qf (
  tenant_id      uuid not null,
  aula_key       text not null,
  filtro         jsonb not null default '{}'::jsonb,
  atualizado_em  timestamptz not null default now(),
  atualizado_por uuid,
  primary key (tenant_id, aula_key)
);

-- Mesmo padrão da tabela do catálogo: RLS ligado e SEM policies → só o service role (backend) acessa.
alter table simulado_cronograma_adaptativo_qf enable row level security;

notify pgrst, 'reload schema';
