-- Vínculo banco (pasta) ↔ grupo de estudantes.
-- Quando um grupo é vinculado a um banco, seus membros são ligados ao banco;
-- e novos membros do grupo passam a ser ligados automaticamente ao banco.
CREATE TABLE IF NOT EXISTS simulado_pasta_grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  pasta_id uuid NOT NULL,
  grupo_id uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pasta_id, grupo_id)
);

CREATE INDEX IF NOT EXISTS idx_pasta_grupos_grupo ON simulado_pasta_grupos (grupo_id);
CREATE INDEX IF NOT EXISTS idx_pasta_grupos_pasta ON simulado_pasta_grupos (pasta_id);
