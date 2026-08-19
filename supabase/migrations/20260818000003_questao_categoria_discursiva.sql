-- ═══════════════════════════════════════════════════════════════════════════
-- Discursivas — CATEGORIA da questão discursiva (subtítulo mostrado ao aluno):
--   • 'questao' = Questão discursiva (dissertativa)
--   • 'peca'    = Peça jurídica (redigir uma peça)
-- Só rotulagem/organização. Não afeta a correção.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_questoes ADD COLUMN IF NOT EXISTS categoria_discursiva text;
