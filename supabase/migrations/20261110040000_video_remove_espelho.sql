-- Vídeo próprio: remove o ESPELHO local e a fila de sincronização de matrículas.
-- Decisão: "o gerenciador manda, a plataforma se adapta" — cursos/aulas vivem só no serviço de vídeo;
-- o acesso do aluno é decidido pela plataforma (currículo/produto) e a matrícula é criada SOB DEMANDA.
-- As tabelas estão VAZIAS (integração nunca foi ligada em produção), então o DROP não perde dados.
DROP TABLE IF EXISTS video_matriculas_sync CASCADE;
DROP TABLE IF EXISTS video_aulas CASCADE;
DROP TABLE IF EXISTS video_cursos CASCADE;
DROP TABLE IF EXISTS video_empresas CASCADE;
