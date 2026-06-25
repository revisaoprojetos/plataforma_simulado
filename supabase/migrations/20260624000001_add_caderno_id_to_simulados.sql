-- Vincula simulados ao caderno de designer para personalização visual
ALTER TABLE simulados
  ADD COLUMN IF NOT EXISTS caderno_id uuid REFERENCES cadernos_designer(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_simulados_caderno_id ON simulados(caderno_id);
