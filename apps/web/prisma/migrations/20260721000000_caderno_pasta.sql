-- Pastas (folders) para organizar os CADERNOS de prova (mesmo esquema do Banco/Aplicação).
--   simulado_cadernos_designer.pasta_id → dentro de qual pasta o caderno está (NULL = raiz).
-- As pastas são linhas em simulado_pastas com is_folder=true e folder_area='caderno'
-- (folder_area já criado na migration 20260720130000). Aditivo, idempotente e tolerante.
ALTER TABLE simulado_cadernos_designer ADD COLUMN IF NOT EXISTS pasta_id uuid REFERENCES simulado_pastas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_simulado_cadernos_pasta ON simulado_cadernos_designer(pasta_id) WHERE pasta_id IS NOT NULL;
