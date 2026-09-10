-- Publicação/agendamento por MÓDULO (pasta folder_area='leitura'), no estilo simulado:
-- status rascunho/publicado + janela opcional (publicar_em agenda o início; encerrar_em tira o
-- acesso do aluno ao fim, sem apagar nada). Guardado em jsonb tolerante.
--   { "status": "rascunho"|"publicado", "publicarEm": iso|null, "encerrarEm": iso|null }
ALTER TABLE public.simulado_pastas ADD COLUMN IF NOT EXISTS publicacao jsonb;

NOTIFY pgrst, 'reload schema';
