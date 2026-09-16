-- "Comece por aqui" (pré-aula/introdução) por módulo LegProc (simulado_pastas, folder_area='leitura').
-- jsonb: { ativo, tipo: 'leitura'|'video'|'link', documento_id?, url?, titulo?, descricao? }. Um nó no
-- TOPO da trilha do aluno, fora do gate (não conta no done/total). Código tolerante: sem coluna, sem nó.
ALTER TABLE public.simulado_pastas ADD COLUMN IF NOT EXISTS intro_config jsonb;

NOTIFY pgrst, 'reload schema';
