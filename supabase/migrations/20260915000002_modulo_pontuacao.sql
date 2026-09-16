-- Pontuação da gamificação por módulo LegProc (simulado_pastas, folder_area='leitura'): pontos por aula
-- concluída, por acerto no quiz e bônus de combo (aula gabaritada). Fica DORMENTE até a gamificação do
-- tenant ser ativada — enquanto isso o ranking usa só os acertos. jsonb tolerante (sem coluna = padrões).
ALTER TABLE public.simulado_pastas ADD COLUMN IF NOT EXISTS pontuacao jsonb;

NOTIFY pgrst, 'reload schema';
