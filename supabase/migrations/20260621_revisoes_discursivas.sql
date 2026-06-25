-- Tabela de solicitações de revisão de correção discursiva

CREATE TABLE IF NOT EXISTS revisoes_discursivas (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  resposta_id    uuid NOT NULL REFERENCES respostas_discursivas(id) ON DELETE CASCADE,
  estudante_id   uuid NOT NULL,
  justificativa  text NOT NULL,
  status         text NOT NULL DEFAULT 'pendente'
                   CHECK (status IN ('pendente', 'em_analise', 'aceita', 'recusada')),
  nota_original  numeric(5,2),
  nota_revisada  numeric(5,2),
  motivo_decisao text,
  created_at     timestamptz DEFAULT now(),
  updated_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS revisoes_discursivas_resposta_idx ON revisoes_discursivas(resposta_id);
CREATE INDEX IF NOT EXISTS revisoes_discursivas_status_idx   ON revisoes_discursivas(status);
