-- Produtos/Extensivos — colunas ricas do catálogo (reconciliação de versão).
-- O CREATE da migração 20261030000000 virou no-op porque a tabela `simulado_produtos` já existia
-- (colisão de timestamp com a migração de regras, hoje resolvida). CREATE IF NOT EXISTS NÃO adiciona
-- coluna em tabela existente, então estas colunas precisam entrar por ALTER. Idempotente e aditivo.
-- Ver docs/produtos-extensivos-blueprint.md. Divisão: catálogo (produtos) × regras (liberacao).

ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS tipo          text    NOT NULL DEFAULT 'extensivo';
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS tier          text    NOT NULL DEFAULT 'normal';
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS validade_tipo text    NOT NULL DEFAULT 'vitalicio';
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS validade_dias integer;
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS validade_data timestamptz;
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS cor           text;
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS capa_url      text;
ALTER TABLE public.simulado_produtos ADD COLUMN IF NOT EXISTS ordem         integer NOT NULL DEFAULT 0;
