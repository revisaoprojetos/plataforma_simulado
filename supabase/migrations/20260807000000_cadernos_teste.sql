-- Área de TESTE do editor de cadernos: tabela isolada que espelha simulado_cadernos_designer.
-- Cadernos/salvamentos de teste ficam aqui, sem tocar nos cadernos reais. Idempotente.
CREATE TABLE IF NOT EXISTS simulado_cadernos_teste (LIKE simulado_cadernos_designer INCLUDING ALL);

-- Acesso só via service role (app usa createAdminClient); bloqueia anon/authenticated direto.
ALTER TABLE simulado_cadernos_teste ENABLE ROW LEVEL SECURITY;
