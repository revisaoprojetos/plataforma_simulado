-- HUD do simulado por BANCO (aba "HUD do simulado" em Banco de Simulado).
-- Guarda o tema de cores da prova do aluno no próprio banco (pasta), aplicando a todos os
-- simulados com regras.banco_base_id = este banco. Estrutura: { hudCores, hudPorPagina }.
-- Tolerante: o código cai no tema padrão quando a coluna/valor não existe.
alter table public.simulado_pastas add column if not exists hud jsonb;
