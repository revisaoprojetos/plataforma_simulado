-- Imagem opcional na questão — exibida na prova entre o enunciado e as alternativas.
-- Aditivo e seguro. O código é tolerante (funciona antes/depois de rodar isto).
ALTER TABLE public.simulado_questoes ADD COLUMN IF NOT EXISTS imagem_url text;
