-- ═══════════════════════════════════════════════════════════════════════════
-- Anotações da mesa de correção: comentário por marca.
--
-- Cada demarcação na folha (destaque/ponto/ícone/bolinha/texto) pode ter um comentário
-- do corretor, editável ao clicar na marca ou no índice de anotações. O rótulo de ordem
-- por cor (ex.: "Amarelo 1") é derivado no cliente pela ordem de criação — não precisa coluna.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_anotacoes_discursivas
  ADD COLUMN IF NOT EXISTS comentario text;
