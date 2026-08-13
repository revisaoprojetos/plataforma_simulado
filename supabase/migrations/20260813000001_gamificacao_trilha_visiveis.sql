-- Quantos simulados a trilha mostra antes de rolar (0 = todos, sem rolagem). Default 3.
-- Tolerante: o app cai em 3 se a coluna ainda não existir.
ALTER TABLE public.simulado_gamificacao_config
  ADD COLUMN IF NOT EXISTS trilha_visiveis integer NOT NULL DEFAULT 3;
