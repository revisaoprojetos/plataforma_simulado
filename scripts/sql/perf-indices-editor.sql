-- =====================================================================
-- PERF — Índices (versão para o SQL EDITOR do Supabase).
--
-- Por que esta versão: o SQL Editor roda tudo dentro de UMA transação, e
-- CREATE INDEX CONCURRENTLY NÃO pode rodar em transação (erro 25001). Aqui
-- os índices são SEM CONCURRENTLY — então podem ser colados e rodados TODOS
-- DE UMA VEZ (Run). Cada CREATE INDEX pega um lock rápido na tabela enquanto
-- constrói (segundos nas tabelas abaixo). RODE FORA DE JANELA DE PROVA.
--
-- Todos são IDEMPOTENTES (IF NOT EXISTS) e ADITIVOS. Nada é alterado/removido.
--
-- (A versão com CONCURRENTLY, sem lock, está em perf-indices.sql — use aquela
--  só via CONEXÃO DIRETA porta 5432, um comando por vez, não pelo editor.)
-- =====================================================================

-- simulado_sessoes_prova ------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_simulado_sessoes_prova_estudante_ativas
  ON public.simulado_sessoes_prova (estudante_id, status)
  WHERE is_teste = false AND deletado = false;

CREATE INDEX IF NOT EXISTS ix_simulado_sessoes_prova_simulado_status_ativas
  ON public.simulado_sessoes_prova (simulado_id, status)
  WHERE is_teste = false AND deletado = false;

CREATE INDEX IF NOT EXISTS ix_simulado_sessoes_prova_estudante_simulado
  ON public.simulado_sessoes_prova (estudante_id, simulado_id)
  WHERE deletado = false;

-- simulado_respostas_objetivas -----------------------------------------
-- PULADO DE PROPÓSITO: tabela quente do auto-save e GRANDE. As consultas por
-- sessao_id já são cobertas pela UNIQUE (sessao_id, questao_id); por questao_id
-- há índice equivalente. Criar aqui só duplicaria índice e locaria a tabela.

-- simulado_grupo_membros ------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_simulado_grupo_membros_grupo
  ON public.simulado_grupo_membros (grupo_id);

CREATE INDEX IF NOT EXISTS ix_simulado_grupo_membros_estudante
  ON public.simulado_grupo_membros (estudante_id);

-- simulado_questao_pasta ------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_simulado_questao_pasta_pasta
  ON public.simulado_questao_pasta (pasta_id);

CREATE INDEX IF NOT EXISTS ix_simulado_questao_pasta_questao
  ON public.simulado_questao_pasta (questao_id);

-- simulado_matriculas ---------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_simulado_matriculas_estudante_simulado
  ON public.simulado_matriculas (estudante_id, simulado_id);

CREATE INDEX IF NOT EXISTS ix_simulado_matriculas_tenant_simulado
  ON public.simulado_matriculas (tenant_id, simulado_id);

-- simulado_acessos ------------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_simulado_acessos_estudante_expira
  ON public.simulado_acessos (estudante_id, expira_em);

CREATE INDEX IF NOT EXISTS ix_simulado_acessos_simulado_estudante
  ON public.simulado_acessos (simulado_id, estudante_id);

-- simulado_audit_logs ---------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_simulado_audit_logs_tenant_entidade_id_criado
  ON public.simulado_audit_logs (tenant_id, entidade_id, criado_em DESC);

CREATE INDEX IF NOT EXISTS ix_simulado_audit_logs_tenant_entidade_criado
  ON public.simulado_audit_logs (tenant_id, entidade, criado_em DESC);

-- simulado_estudantes ---------------------------------------------------
CREATE INDEX IF NOT EXISTS ix_simulado_estudantes_tenant_ativos
  ON public.simulado_estudantes (tenant_id)
  WHERE deletado = false;

CREATE INDEX IF NOT EXISTS ix_simulado_estudantes_tenant_lower_email
  ON public.simulado_estudantes (tenant_id, lower(email));

-- Confirmação: veja os índices criados.
-- SELECT tablename, indexname FROM pg_indexes WHERE schemaname='public' AND indexname LIKE 'ix_%' ORDER BY 1,2;
