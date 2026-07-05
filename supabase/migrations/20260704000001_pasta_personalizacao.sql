-- Personalização visual do banco (pasta): cor, ícone e imagem de capa exibidos no card.
ALTER TABLE simulado_pastas ADD COLUMN IF NOT EXISTS cor text;
ALTER TABLE simulado_pastas ADD COLUMN IF NOT EXISTS icone text;
ALTER TABLE simulado_pastas ADD COLUMN IF NOT EXISTS capa_url text;
