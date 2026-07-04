-- Grupos de disciplinas por banco (pasta): agrupam disciplinas do banco em grupos
-- nomeados (ex.: GRUPO I / II / III) para uso em relatórios e no detalhe por sessão.
-- Formato: [{ "id": "...", "nome": "Grupo I", "disciplinas": ["Direito Civil", ...] }]
ALTER TABLE simulado_pastas
  ADD COLUMN IF NOT EXISTS grupos jsonb NOT NULL DEFAULT '[]'::jsonb;
