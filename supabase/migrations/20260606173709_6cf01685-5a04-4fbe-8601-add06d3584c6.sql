ALTER TABLE public.simulados
  ADD COLUMN IF NOT EXISTS mostrar_resultado boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS permitir_retentativa boolean NOT NULL DEFAULT false;