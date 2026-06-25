ALTER TABLE public.simulados
  ADD COLUMN IF NOT EXISTS permitir_atraso_entrada boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tempo_maximo_atraso_minutos integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS exibir_popup_atraso boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS tempo_popup_atraso_minutos integer NOT NULL DEFAULT 5;

ALTER TABLE public.simulados
  DROP CONSTRAINT IF EXISTS simulados_tempo_maximo_atraso_check;
ALTER TABLE public.simulados
  ADD CONSTRAINT simulados_tempo_maximo_atraso_check
  CHECK (tempo_maximo_atraso_minutos BETWEEN 1 AND 240);

ALTER TABLE public.simulados
  DROP CONSTRAINT IF EXISTS simulados_tempo_popup_atraso_check;
ALTER TABLE public.simulados
  ADD CONSTRAINT simulados_tempo_popup_atraso_check
  CHECK (tempo_popup_atraso_minutos BETWEEN 1 AND 240);