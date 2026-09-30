-- Enriquece o log de entregas de webhook com o DESTINATÁRIO e a MENSAGEM enviada, para auditoria
-- ("quem recebeu, com que nome e que texto") e prova de disparo (P0.6). Também marca envios de TESTE.
-- Tolerante: o dispatch grava best-effort; sem estas colunas o envio segue (cai no insert base).
ALTER TABLE simulado_webhook_saida_logs
  ADD COLUMN IF NOT EXISTS estudante_id     uuid,
  ADD COLUMN IF NOT EXISTS contato_nome     text,
  ADD COLUMN IF NOT EXISTS contato_email    text,
  ADD COLUMN IF NOT EXISTS contato_telefone text,
  ADD COLUMN IF NOT EXISTS mensagem         text,
  ADD COLUMN IF NOT EXISTS teste            boolean NOT NULL DEFAULT false;
