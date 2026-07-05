-- Personalização visual do caderno de prova: cor, ícone e imagem de capa (card).
ALTER TABLE simulado_cadernos_designer ADD COLUMN IF NOT EXISTS cor text;
ALTER TABLE simulado_cadernos_designer ADD COLUMN IF NOT EXISTS icone text;
ALTER TABLE simulado_cadernos_designer ADD COLUMN IF NOT EXISTS capa_url text;
