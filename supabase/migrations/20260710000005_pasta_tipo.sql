-- Tipo do banco (pasta): objetiva | discursiva. Definido na criação do banco.
-- Usado para pular a etapa "Tipo" na criação do simulado (o tipo vem do banco)
-- e para exibir o selo do tipo na capa do banco.
ALTER TABLE public.simulado_pastas ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'objetiva';
