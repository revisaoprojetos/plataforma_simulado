-- Acessos exclusivos (MODO TESTE) do desafio: contas de teste (admins que usam e-mail de estudante)
-- que veem TODAS as aulas liberadas todo dia, podem refazer o desafio à vontade e NÃO contabilizam
-- (sem XP/streak, fora do ranking) — só para verificar a visualização do aluno.
-- Formato: uuid[] de estudante_id. Guardado por módulo (pasta), igual ao ranking_ocultos.
-- Código tolerante à ausência da coluna (feature dormente até aplicar).
alter table simulado_pastas add column if not exists testadores_exclusivos jsonb default '[]'::jsonb;
