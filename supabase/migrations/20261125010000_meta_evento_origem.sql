-- Canal da marcação de meta no log de eventos: 'meta_clique' (clique direto), 'sync_iframe' (sincronização do cronograma), 'outro'.
-- Aditivo e opcional: o código grava sem a coluna enquanto ela não existir. Rollback: ALTER TABLE ... DROP COLUMN origem;
ALTER TABLE public.simulado_cronograma_adaptativo_meta_evento ADD COLUMN IF NOT EXISTS origem text;
