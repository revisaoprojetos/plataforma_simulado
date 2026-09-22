-- Ocultar alunos/grupos do ranking do módulo (contas de teste): não contam pontos/posição e não
-- aparecem para o aluno. Formato: { estudantes: uuid[], grupos: uuid[], total: boolean }.
-- Código tolerante à ausência da coluna (feature dormente até aplicar).
alter table simulado_pastas add column if not exists ranking_ocultos jsonb;
