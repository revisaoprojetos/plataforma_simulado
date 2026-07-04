-- Código estável e único por questão (não é numeração de posição).
-- Igual em qualquer lugar do sistema → referência sem confusão.
ALTER TABLE simulado_questoes ADD COLUMN IF NOT EXISTS codigo text;

-- Backfill determinístico a partir do UUID (mesma regra do app).
UPDATE simulado_questoes
   SET codigo = 'Q-' || upper(substr(replace(id::text, '-', ''), 1, 8))
 WHERE codigo IS NULL;

-- Novas questões recebem o código automaticamente no INSERT.
CREATE OR REPLACE FUNCTION simulado_questao_set_codigo() RETURNS trigger AS $$
BEGIN
  IF NEW.codigo IS NULL THEN
    NEW.codigo := 'Q-' || upper(substr(replace(NEW.id::text, '-', ''), 1, 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_simulado_questao_codigo ON simulado_questoes;
CREATE TRIGGER trg_simulado_questao_codigo
  BEFORE INSERT ON simulado_questoes
  FOR EACH ROW EXECUTE FUNCTION simulado_questao_set_codigo();

CREATE INDEX IF NOT EXISTS idx_simulado_questoes_codigo ON simulado_questoes (tenant_id, codigo);
