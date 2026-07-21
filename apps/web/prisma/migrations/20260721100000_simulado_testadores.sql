-- "Acesso de teste": estudantes (inclui admins que tenham cadastro de estudante) autorizados a
-- FAZER o simulado como TESTE — mesmo antes de começar ou depois de encerrado. A sessão desses
-- testadores nasce com is_teste=true (já excluída de estatísticas/ranking/relatórios).
-- Sem FKs rígidas (o app garante integridade e escopo por tenant); aditivo e idempotente.
CREATE TABLE IF NOT EXISTS simulado_testadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  simulado_id uuid NOT NULL,
  estudante_id uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (simulado_id, estudante_id)
);
CREATE INDEX IF NOT EXISTS idx_simulado_testadores_sim ON simulado_testadores (simulado_id);
