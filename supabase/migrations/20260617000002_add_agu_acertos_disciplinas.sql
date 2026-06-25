-- Armazena acertos por disciplina do simulado AGU no perfil do estudante.
-- Preenchido via função salvarAcertosAGUBatch no painel admin.
ALTER TABLE public.estudantes
ADD COLUMN IF NOT EXISTS agu_acertos_por_disciplina JSONB;
