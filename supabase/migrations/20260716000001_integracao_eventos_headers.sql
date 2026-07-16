-- Guarda os headers da requisição do webhook (para o pop-up de detalhe mostrar tudo, estilo n8n).
ALTER TABLE public.simulado_integracao_eventos ADD COLUMN IF NOT EXISTS headers jsonb;
