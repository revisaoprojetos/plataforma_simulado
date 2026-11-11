-- Performance (Biblioteca > abas de conteúdo e Questões > Etiquetas). Idempotente; só índices (sem alterar dado).
-- Motivo (EXPLAIN em transação READ ONLY): seq scan em simulado_prova_questoes (11,5 mil linhas, sem índice por questao_id/simulado_id),
-- em simulado_questoes (contagem total/sem etiqueta por tenant) e em simulado_simulados (lista por tenant). Cresce linearmente com o banco.

-- "em simulados" por etiqueta (join por questao_id) e contagem de questões por simulado (where tenant_id + simulado_id)
create index if not exists idx_prova_questoes_questao on public.simulado_prova_questoes (questao_id);
create index if not exists idx_prova_questoes_tenant_simulado on public.simulado_prova_questoes (tenant_id, simulado_id);

-- total do banco / questões sem etiqueta por tenant (somente não deletadas)
create index if not exists idx_simulado_questoes_tenant_ativas on public.simulado_questoes (tenant_id) where deletado = false;

-- vínculos da etiqueta filtrados por tenant (agregação por etiqueta)
create index if not exists idx_questao_etiquetas_tenant_etiqueta on public.simulado_questao_etiquetas (tenant_id, etiqueta_id);

-- aba Simulados da Biblioteca (lista paginada por tenant, mais recentes primeiro)
create index if not exists idx_simulado_simulados_tenant_criado on public.simulado_simulados (tenant_id, created_at desc, id) where deletado = false and owner_estudante_id is null;
