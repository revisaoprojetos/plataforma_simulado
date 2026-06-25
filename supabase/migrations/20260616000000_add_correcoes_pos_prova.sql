ALTER TABLE public.simulados
  ADD COLUMN IF NOT EXISTS correcoes_pos_prova jsonb NOT NULL DEFAULT '[]'::jsonb;
