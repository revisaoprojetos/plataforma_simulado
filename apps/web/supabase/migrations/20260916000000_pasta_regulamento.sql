-- Regulamento do módulo (LegProc/Leitura): área descritiva que o aluno consulta na aba "Regulamento"
-- — { ativo, titulo, descricao, video_url } em jsonb. As metas/ganhos são derivadas da coluna `pontuacao`.
-- Tolerante: o código cai nos defaults (regulamento inativo) se a coluna ainda não existir.
ALTER TABLE simulado_pastas ADD COLUMN IF NOT EXISTS regulamento jsonb;
