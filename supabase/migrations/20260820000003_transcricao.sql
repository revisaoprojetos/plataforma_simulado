-- Discursivas — transcrição da resposta (OCR/manual, sem depender de IA) persistida por resposta.
ALTER TABLE public.simulado_respostas_discursivas
  ADD COLUMN IF NOT EXISTS transcricao text;
