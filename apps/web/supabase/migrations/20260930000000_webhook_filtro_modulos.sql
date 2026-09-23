-- Filtro por MÓDULO de leitura nos webhooks (espelha filtro_simulados). Usado pelos eventos
-- leitura.inativo/sequencia/marco (gamificação da área de leitura / Lei Seca): o webhook pode
-- escolher módulos específicos (simulado_pastas com folder_area='leitura'). Vazio = todos. Tolerante.
ALTER TABLE simulado_webhook_saida ADD COLUMN IF NOT EXISTS filtro_modulos jsonb NOT NULL DEFAULT '[]'::jsonb;
