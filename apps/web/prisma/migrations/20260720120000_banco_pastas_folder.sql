-- Pastas (folders) para organizar os bancos de simulado como cards no grid.
--   pai_id    → dentro de qual pasta o banco/pasta está (NULL = raiz).
--   is_folder → marca a linha como PASTA-container (não é um banco de questões).
-- Aditivo e idempotente; o app é tolerante caso ainda não tenha rodado (some o recurso de pastas).
ALTER TABLE simulado_pastas ADD COLUMN IF NOT EXISTS pai_id uuid REFERENCES simulado_pastas(id) ON DELETE SET NULL;
ALTER TABLE simulado_pastas ADD COLUMN IF NOT EXISTS is_folder boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_simulado_pastas_pai ON simulado_pastas(pai_id) WHERE pai_id IS NOT NULL;
