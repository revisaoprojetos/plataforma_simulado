-- Adesivo de conquista do módulo LegProc (simulado_pastas, folder_area='leitura'): imagem exibida SOBRE
-- o balão da aula na trilha quando o aluno GABARITA aquela aula (100% do quiz). URL pública no storage.
-- Código é tolerante: sem esta coluna, o adesivo simplesmente não aparece / não salva.
ALTER TABLE public.simulado_pastas ADD COLUMN IF NOT EXISTS adesivo_url text;

NOTIFY pgrst, 'reload schema';
