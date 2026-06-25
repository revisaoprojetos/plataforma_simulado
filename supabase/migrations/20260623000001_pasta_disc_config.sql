-- Configuração de disciplinas por pasta (ordem e pilares)
ALTER TABLE pastas ADD COLUMN IF NOT EXISTS disc_config jsonb DEFAULT NULL;

-- Vínculo de simulado com pasta (para herdar configuração de ordem)
ALTER TABLE simulados ADD COLUMN IF NOT EXISTS pasta_id uuid REFERENCES pastas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_simulados_pasta_id ON simulados(pasta_id);
