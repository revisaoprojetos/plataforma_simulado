-- T9 — Índices para os filtros MAIS QUENTES (menos linhas varridas = menos custo/egress).
-- Aplicar MANUALMENTE no Supabase (SQL Editor). Idempotente (IF NOT EXISTS).
--
-- ⚠️ Tabelas grandes (respostas_objetivas ~170k, sessoes_prova): em PRODUÇÃO, prefira criar com
--    CREATE INDEX CONCURRENTLY (não bloqueia escrita) — mas CONCURRENTLY NÃO pode rodar dentro de
--    transação/bloco. Rode cada CONCURRENTLY isolado, OU use as versões normais fora de pico.
--
-- Colunas confirmadas pelo uso no código (.eq/.in/.gte). Ajuste se algum nome divergir no seu schema.

-- ── simulado_respostas_objetivas ──────────────────────────────────────────────
-- Padrão: .in('sessao_id', [...]) (relatórios, resultado, re-correção, encerramento).
CREATE INDEX IF NOT EXISTS idx_respostas_sessao       ON public.simulado_respostas_objetivas (sessao_id);
-- Escopo por tenant + sessão (varreduras filtradas por tenant).
CREATE INDEX IF NOT EXISTS idx_respostas_tenant_sessao ON public.simulado_respostas_objetivas (tenant_id, sessao_id);

-- ── simulado_sessoes_prova ────────────────────────────────────────────────────
-- Ranking / progresso ao vivo por simulado.
CREATE INDEX IF NOT EXISTS idx_sessoes_sim_status     ON public.simulado_sessoes_prova (simulado_id, status);
-- Páginas do aluno (histórico dele) — filtram por estudante.
CREATE INDEX IF NOT EXISTS idx_sessoes_estudante      ON public.simulado_sessoes_prova (estudante_id);
-- Auto-encerramento varre em_andamento (parcial: só o que interessa).
CREATE INDEX IF NOT EXISTS idx_sessoes_em_andamento   ON public.simulado_sessoes_prova (simulado_id)
  WHERE status = 'em_andamento' AND deletado = false;
-- Dashboard/série por período (iniciado_em) dentro do tenant.
CREATE INDEX IF NOT EXISTS idx_sessoes_tenant_inicio  ON public.simulado_sessoes_prova (tenant_id, iniciado_em);

-- ── simulado_leitura_respostas ────────────────────────────────────────────────
-- Acesso à aula do aluno: .eq('estudante_id').eq('documento_id').in('questao_id').
CREATE INDEX IF NOT EXISTS idx_leitura_resp_est_doc   ON public.simulado_leitura_respostas (estudante_id, documento_id);

-- ── audit_logs ────────────────────────────────────────────────────────────────
-- Visualizador de auditoria: por ator, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS idx_audit_actor_data       ON public.audit_logs (actor_user_id, criado_em DESC);

-- ── simulado_prova_questoes ───────────────────────────────────────────────────
-- Join simulado→questões (correção, tipoSim, etc.).
CREATE INDEX IF NOT EXISTS idx_prova_questoes_sim     ON public.simulado_prova_questoes (simulado_id);

-- Versões CONCURRENTLY (opcional, p/ as tabelas grandes sem lock — rode uma a uma, fora de transação):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_respostas_sessao ON public.simulado_respostas_objetivas (sessao_id);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sessoes_sim_status ON public.simulado_sessoes_prova (simulado_id, status);
