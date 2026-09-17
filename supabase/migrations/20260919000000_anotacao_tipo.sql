-- ═══════════════════════════════════════════════════════════════════════════
-- Leitura — ANOTAÇÕES: tipo (grifo | nota).
--
-- "grifo" = realce cheio (como já existia). "nota" = SUBLINHADO no texto + PONTO
-- na margem + balão com o comentário do aluno. Mesma âncora/tabela; só muda o
-- render. Coluna tolerante (default 'grifo') → código roda antes de aplicar.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_leitura_anotacoes
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'grifo';

ALTER TABLE public.simulado_documento_anotacoes_base
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'grifo';

NOTIFY pgrst, 'reload schema';
