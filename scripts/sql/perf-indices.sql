-- =====================================================================
-- PERF — Índices para os filtros mais quentes da plataforma.
-- Alvo: eliminar seq scans em consultas de portal do aluno, relatórios,
-- grupos/bancos, acesso avulso e auditoria.
--
-- ⚠️ COMO RODAR: UM comando por vez, SOZINHO.
--   CREATE INDEX CONCURRENTLY não trava a tabela (seguro em produção/prova),
--   MAS não pode rodar dentro de transação/bloco. No SQL Editor do Supabase,
--   selecione e execute UM único statement de cada vez (sem BEGIN/COMMIT em
--   volta; NÃO cole o arquivo inteiro e rode de uma vez).
--
-- Todos são ADITIVOS e IDEMPOTENTES (IF NOT EXISTS): só criam índice, nunca
-- alteram dados nem removem nada. Se um índice equivalente já existir com
-- outro nome, o IF NOT EXISTS por nome ainda cria — confira antes o que já há:
--   SELECT indexname, indexdef FROM pg_indexes WHERE tablename = '<tabela>';
--
-- Nomes: ix_<tabela>_<colunas>. Colunas conferidas contra o schema real
-- (migrations em supabase/migrations/ + uso no código apps/web).
-- =====================================================================


-- ---------------------------------------------------------------------
-- simulado_sessoes_prova
-- ---------------------------------------------------------------------

-- Portal do aluno / desempenho: sessões de UM estudante, sempre com
-- is_teste=false e deletado=false (ex.: aluno/(portal)/simulados, desempenho-aluno).
-- O idx_sessoes_estudante existente é só (estudante_id) e não filtra teste/deletado.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_sessoes_prova_estudante_ativas
  ON public.simulado_sessoes_prova (estudante_id, status)
  WHERE is_teste = false AND deletado = false;

-- Relatórios/ranking por simulado: varre as sessões de UM simulado filtrando
-- is_teste=false e deletado=false (relatorios/simulados/_dados, ranking/_dados).
-- O idx_sessoes_simulado_status existente é parcial só por is_teste=false
-- (foi criado antes da coluna deletado) — este cobre o filtro completo atual.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_sessoes_prova_simulado_status_ativas
  ON public.simulado_sessoes_prova (simulado_id, status)
  WHERE is_teste = false AND deletado = false;

-- Lookup direto dono+simulado (retomar/validar sessão): par (estudante_id, simulado_id).
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_sessoes_prova_estudante_simulado
  ON public.simulado_sessoes_prova (estudante_id, simulado_id)
  WHERE deletado = false;


-- ---------------------------------------------------------------------
-- simulado_respostas_objetivas
-- (tabela quente do auto-save; minimizar índices novos)
-- ---------------------------------------------------------------------

-- Todas as respostas de UMA sessão (carregar/corrigir a prova do aluno).
-- Já existe idx_respostas_sessao (sessao_id) + UNIQUE(sessao_id, questao_id);
-- criado aqui só se o ambiente não tiver o índice — IF NOT EXISTS evita duplicar.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_respostas_objetivas_sessao
  ON public.simulado_respostas_objetivas (sessao_id);

-- Todas as respostas de UMA questão (re-correção/anulação, "quem errou a X").
-- Já existe idx_simulado_respostas_questao_sessao (questao_id, sessao_id);
-- IF NOT EXISTS torna este no-op onde aquele já foi aplicado.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_respostas_objetivas_questao
  ON public.simulado_respostas_objetivas (questao_id);


-- ---------------------------------------------------------------------
-- simulado_grupo_membros
-- ---------------------------------------------------------------------

-- Membros de UM grupo (import Curseduca, propagação grupo→banco, sync).
-- A PK/UNIQUE (grupo_id, estudante_id) já lidera por grupo_id; este é
-- redundante-por-segurança onde a PK não veio no rename — no-op se já indexado.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_grupo_membros_grupo
  ON public.simulado_grupo_membros (grupo_id);

-- Grupos de UM estudante (existência/remoção por aluno: grupo-passaporte/vitalicio).
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_grupo_membros_estudante
  ON public.simulado_grupo_membros (estudante_id);


-- ---------------------------------------------------------------------
-- simulado_questao_pasta  (junção banco/pasta N:N; PK = (questao_id, pasta_id))
-- ---------------------------------------------------------------------

-- Questões de UM banco/pasta (copiar banco, listar/dedupe por pasta_id).
-- A PK lidera por questao_id, então NÃO serve filtro por pasta_id — este resolve.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_questao_pasta_pasta
  ON public.simulado_questao_pasta (pasta_id);

-- Pastas/bancos de UMA questão (a PK já cobre questao_id-leading; criado só se
-- o ambiente não tiver a PK — IF NOT EXISTS deixa no-op onde ela existe).
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_questao_pasta_questao
  ON public.simulado_questao_pasta (questao_id);


-- ---------------------------------------------------------------------
-- simulado_matriculas
-- ---------------------------------------------------------------------

-- Matrículas de UM estudante (portal do aluno: gate de acesso por aluno).
-- A UNIQUE (tenant_id, estudante_id, simulado_id) NÃO lidera por estudante_id;
-- este composto (estudante_id, simulado_id) serve o filtro do portal.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_matriculas_estudante_simulado
  ON public.simulado_matriculas (estudante_id, simulado_id);

-- Matrículas de UM simulado dentro do tenant (admin: matriculados/liberados,
-- ao-vivo, integrações). Casa com os filtros tenant_id + simulado_id do código.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_matriculas_tenant_simulado
  ON public.simulado_matriculas (tenant_id, simulado_id);


-- ---------------------------------------------------------------------
-- simulado_acessos  (acesso avulso / prazo relativo)
-- ---------------------------------------------------------------------

-- Acessos de UM estudante ordenados/filtrados por validade (portal home lê
-- expira_em; gate por prazo). (estudante_id, expira_em) cobre filtro + range.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_acessos_estudante_expira
  ON public.simulado_acessos (estudante_id, expira_em);

-- Acesso avulso específico dono+simulado (hot: embed/identify valida o par
-- simulado_id + estudante_id antes de abrir a sessão; admin lista por simulado).
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_acessos_simulado_estudante
  ON public.simulado_acessos (simulado_id, estudante_id);


-- ---------------------------------------------------------------------
-- simulado_audit_logs  (visualizador de auditoria; sempre por tenant + tempo)
-- ---------------------------------------------------------------------

-- Trilha de UMA entidade específica no tenant, mais recentes primeiro
-- (drill-down por entidade_id). Ordena por criado_em DESC como a UI.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_audit_logs_tenant_entidade_id_criado
  ON public.simulado_audit_logs (tenant_id, entidade_id, criado_em DESC);

-- Lista por MÓDULO/entidade no tenant, mais recentes primeiro (filtro "O que
-- aconteceu" da auditoria: eq(entidade) + order(criado_em desc)).
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_audit_logs_tenant_entidade_criado
  ON public.simulado_audit_logs (tenant_id, entidade, criado_em DESC);


-- ---------------------------------------------------------------------
-- simulado_estudantes
-- ---------------------------------------------------------------------

-- Estudantes ativos do tenant (listagens/contagens filtram tenant_id + deletado).
-- Existe idx_estudantes_tenant (tenant_id) simples; este é parcial pelos ativos.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_estudantes_tenant_ativos
  ON public.simulado_estudantes (tenant_id)
  WHERE deletado = false;

-- Busca/login por e-mail case-insensitive (identificação leve email/email_cpf;
-- resolução de aluno por e-mail). Índice funcional em lower(email) por tenant.
CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_simulado_estudantes_tenant_lower_email
  ON public.simulado_estudantes (tenant_id, lower(email));
