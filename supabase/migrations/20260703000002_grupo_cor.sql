-- Cor de identificação do grupo de estudantes (hex, ex.: #4f7fff).
ALTER TABLE simulado_grupos
  ADD COLUMN IF NOT EXISTS cor text;
