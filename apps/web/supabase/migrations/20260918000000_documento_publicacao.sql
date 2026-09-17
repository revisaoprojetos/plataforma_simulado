-- Publicação da AULA (documento) com estados + agendamento.
-- publicacao jsonb: { estado: 'rascunho' | 'visualizavel' | 'publicada', publicarEm: timestamptz|null }
--   rascunho    = oculta do aluno
--   visualizavel = aparece na trilha, mas BLOQUEADA ("ainda não liberada")
--   publicada   = liberada
-- O booleano `publicado` continua sendo a fonte de "liberada" (mantém compat com todas as queries).
-- Agendamento (publicarEm) é resolvido de forma preguiçosa na leitura (flip publicado=true quando vence).
ALTER TABLE simulado_documentos ADD COLUMN IF NOT EXISTS publicacao jsonb;

-- Índice parcial para achar rapidamente agendamentos pendentes (opcional, ajuda o flip preguiçoso).
CREATE INDEX IF NOT EXISTS idx_documentos_publicar_em
  ON simulado_documentos ((publicacao->>'publicarEm'))
  WHERE publicacao ? 'publicarEm';
