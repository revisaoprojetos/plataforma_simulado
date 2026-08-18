-- ═══════════════════════════════════════════════════════════════════════════
-- Discursivas — campos INFORMATIVOS da questão (mostrados ao aluno):
--   • pontuacao_total: quanto a questão vale no total (ex.: 10,0)
--   • linhas: nº máximo de linhas esperado na resposta (ex.: 30)
-- Não afetam a correção (a nota continua vindo das competências). Só exibição.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_questoes ADD COLUMN IF NOT EXISTS pontuacao_total numeric;
ALTER TABLE public.simulado_questoes ADD COLUMN IF NOT EXISTS linhas integer;
