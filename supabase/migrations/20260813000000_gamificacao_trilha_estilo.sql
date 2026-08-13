-- Estilo do designer da trilha no portal do aluno: 'cards' (padrão, atual) ou 'caminho' (Duolingo).
-- Tolerante: o app cai em 'cards' se a coluna ainda não existir.
ALTER TABLE public.simulado_gamificacao_config
  ADD COLUMN IF NOT EXISTS trilha_estilo text NOT NULL DEFAULT 'cards';
