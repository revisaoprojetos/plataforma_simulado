-- Extras do webhook de saída (paridade com a tela de referência):
--  envios_simultaneos  = quantos envios em paralelo (hint de vazão)
--  filtro_simulados    = lista de simulado_id que disparam (vazio = todos)
ALTER TABLE public.simulado_webhook_saida ADD COLUMN IF NOT EXISTS envios_simultaneos integer NOT NULL DEFAULT 5;
ALTER TABLE public.simulado_webhook_saida ADD COLUMN IF NOT EXISTS filtro_simulados jsonb NOT NULL DEFAULT '[]';
