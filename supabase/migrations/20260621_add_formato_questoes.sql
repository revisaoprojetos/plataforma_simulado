-- Adiciona formato (objetivo/discursivo) e gabarito esperado para questões discursivas

ALTER TABLE questoes
  ADD COLUMN IF NOT EXISTS formato text NOT NULL DEFAULT 'objetivo';

DO $$ BEGIN
  ALTER TABLE questoes ADD CONSTRAINT questoes_formato_check CHECK (formato IN ('objetivo', 'discursivo'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE questoes
  ADD COLUMN IF NOT EXISTS gabarito_discursivo text;
