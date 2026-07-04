-- Ordem manual das questões dentro de um banco (pasta).
-- Guarda a lista ordenada de questao_id; questões novas (fora da lista) vão para o fim.
ALTER TABLE simulado_pastas ADD COLUMN IF NOT EXISTS ordem_questoes jsonb NOT NULL DEFAULT '[]'::jsonb;
