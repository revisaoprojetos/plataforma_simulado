-- Banco de questões (Biblioteca › Questões): índices para leituras agregadas e lista paginada. Idempotente e tolerante (o código funciona sem eles).
-- Medido (EXPLAIN em transação READ ONLY): a lista por tenant faz seq scan; hoje é barato (5,7 mil questões / 30 mil alternativas)
-- mas cresce linearmente com o banco. Sem CONCURRENTLY (a migration roda em transação).

-- (simulado_alternativas.questao_id já é coberto por idx_alternativas_questao, migration 20261113020000)

-- visão "Com erro reportado" (exists por questão com status pendente) e chip de contagem
create index if not exists idx_simulado_feedbacks_questao_pendente on public.simulado_feedbacks_questao (questao_id) where status = 'pendente';

-- lista padrão do Banco: ordenação por atualização dentro do tenant, só questões não excluídas
create index if not exists idx_simulado_questoes_tenant_atualizado on public.simulado_questoes (tenant_id, (coalesce(updated_at, created_at)) desc, id) where deletado = false;

-- árvore por banca/órgão/ano e contagens agregadas (group by) — tenant + coluna
create index if not exists idx_simulado_questoes_tenant_banca on public.simulado_questoes (tenant_id, banca_id) where deletado = false;
create index if not exists idx_simulado_questoes_tenant_orgao on public.simulado_questoes (tenant_id, orgao_id) where deletado = false;
