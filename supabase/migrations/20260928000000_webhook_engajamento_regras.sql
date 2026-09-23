-- Regras de engajamento POR WEBHOOK (antes eram globais na gamificação).
-- Cada webhook que assina os eventos gamificacao.* guarda AQUI suas próprias regras:
--   { inativo:{dias,mensagem}, sequencia:{dias,mensagem}, marco:{marcos:[..],mensagem} }
-- Assim dá pra ter, ex., um webhook de marco disparando em 7/14/21 e outro em 10/20/30.
-- Coluna aditiva + tolerante (o código cai nos defaults se estiver ausente/vazia).
ALTER TABLE simulado_webhook_saida
  ADD COLUMN IF NOT EXISTS engajamento_regras jsonb NOT NULL DEFAULT '{}'::jsonb;
