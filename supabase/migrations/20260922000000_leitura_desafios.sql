-- ═══════════════════════════════════════════════════════════════════════════
-- Desafios do módulo "Desafio de Lei Seca" (leitura): metas de longo prazo por MÓDULO
-- (ex.: concluir N aulas, gabaritar N quizzes, acertar N questões) que concedem um bônus de XP
-- UMA vez por aluno. Configurados no admin (aba Configurações do módulo). jsonb por pasta.
--   desafios = [{ id, titulo, tipo, meta, xp, ativo }]
--   tipo ∈ 'concluir_aulas' | 'gabaritar_quizzes' | 'acertar_questoes'
-- Crédito idempotente no ledger de gamificação (origem='leitura', ref_id='desafio:<pasta>:<id>').
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_pastas
  ADD COLUMN IF NOT EXISTS desafios jsonb;

NOTIFY pgrst, 'reload schema';
