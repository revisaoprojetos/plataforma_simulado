-- Legenda das cores do aluno (LegProc Digital): o aluno nomeia o que cada COR da caneta significa
-- (ex.: azul = "Conceito"). Guardado por aluno (global, não por documento) nas preferências de leitura.
-- Mapa jsonb { "<hex>": "<rótulo>" }. Código é tolerante: sem esta coluna, cai nos rótulos-padrão.
ALTER TABLE public.simulado_leitura_preferencias ADD COLUMN IF NOT EXISTS grifo_rotulos jsonb;

NOTIFY pgrst, 'reload schema';
