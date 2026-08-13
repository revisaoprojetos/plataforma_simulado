-- Missões: seleção (ativa por missão, dentro de missoes_def) + rodízio semanal.
-- Nova coluna de config global do rodízio. Tolerante: o código já cai no default se ausente.
ALTER TABLE public.simulado_gamificacao_config
  ADD COLUMN IF NOT EXISTS missoes_config jsonb NOT NULL DEFAULT '{"modo":"todas","por_dia":3}'::jsonb;
