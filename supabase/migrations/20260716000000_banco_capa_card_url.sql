-- Imagem separada para o CARD (pôster 4:5) do banco de simulado.
-- O banner largo do topo continua usando `capa_url`; o card/pôster usa `capa_card_url`
-- (com fallback para `capa_url` quando vazio). Evita a imagem esticar entre os dois formatos.
ALTER TABLE public.simulado_pastas ADD COLUMN IF NOT EXISTS capa_card_url text;
