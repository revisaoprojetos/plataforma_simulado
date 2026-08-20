-- ═══════════════════════════════════════════════════════════════════════════
-- Discursivas — Fase 3: proposta de correção pela IA (Claude visão).
--
-- Guarda a proposta CRUA da IA na resposta (p/ auditoria/Δ e reimport) e a nota
-- que a IA sugeriu por quesito (nota_ia) — nunca sobrescrita pela nota do humano,
-- para exibir o Δ (IA × auditor). A nota final continua sendo do CORRETOR.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_respostas_discursivas
  ADD COLUMN IF NOT EXISTS ia_payload jsonb,
  ADD COLUMN IF NOT EXISTS ia_em      timestamptz;

ALTER TABLE public.simulado_correcao_competencias
  ADD COLUMN IF NOT EXISTS nota_ia numeric;
