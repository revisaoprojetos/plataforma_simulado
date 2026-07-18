-- Código externo do grupo (ex.: id do canal da Curseduca) — preenchido no import "por canal".
-- Aditivo e seguro: coluna nulável.
ALTER TABLE public.simulado_grupos ADD COLUMN IF NOT EXISTS codigo_externo text;
