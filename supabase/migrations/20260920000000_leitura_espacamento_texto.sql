-- Espaçamento dos TEXTOS (parágrafos) por aluno — separado do espaçamento dos BLOCOS (coluna
-- `espacamento`). Tolerante: o código roda antes de aplicar (save best-effort com retry sem a coluna).
ALTER TABLE public.simulado_leitura_preferencias
  ADD COLUMN IF NOT EXISTS espacamento_texto text;

NOTIFY pgrst, 'reload schema';
