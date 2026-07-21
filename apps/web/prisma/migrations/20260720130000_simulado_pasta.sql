-- Pastas (folders) para organizar os SIMULADOS na Aplicação de Simulado (mesmo esquema do banco).
--   simulado_simulados.pasta_id → dentro de qual pasta o simulado está (NULL = raiz).
--   simulado_pastas.folder_area → separa as pastas por área: 'banco' (Banco de Simulado) x
--     'simulado' (Aplicação de Simulado). Pastas antigas (NULL) contam como de banco.
-- Aditivo e idempotente; o app é tolerante caso ainda não tenha rodado.
ALTER TABLE simulado_simulados ADD COLUMN IF NOT EXISTS pasta_id uuid REFERENCES simulado_pastas(id) ON DELETE SET NULL;
ALTER TABLE simulado_pastas ADD COLUMN IF NOT EXISTS folder_area text;
CREATE INDEX IF NOT EXISTS idx_simulado_simulados_pasta ON simulado_simulados(pasta_id) WHERE pasta_id IS NOT NULL;
