-- Mapeamento de produto → PASTA (banco): o comprador entra na pasta e é liberado nos
-- simulados daquela pasta (exceto os já encerrados). Aditivo e seguro (coluna nulável).
ALTER TABLE public.simulado_integracao_mapeamentos ADD COLUMN IF NOT EXISTS pasta_id uuid;
