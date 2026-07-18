-- Grupo mestre (pasta que agrupa sub-grupos) para simulado_grupos.
-- Aditivo e seguro: apenas novas colunas nuláveis / com default. Nada é apagado.
--
--   is_mestre = true  -> pasta organizacional (agrupa sub-grupos, sem membros diretos)
--   pai_id            -> grupo comum vive dentro de uma pasta (mestre); null = solto
--
-- Aninhamento de 1 nível: mestre -> grupos. Ao apagar a pasta, os filhos viram soltos
-- (ON DELETE SET NULL), nunca são removidos junto.

ALTER TABLE public.simulado_grupos
  ADD COLUMN IF NOT EXISTS pai_id uuid REFERENCES public.simulado_grupos(id) ON DELETE SET NULL;

ALTER TABLE public.simulado_grupos
  ADD COLUMN IF NOT EXISTS is_mestre boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_simulado_grupos_pai
  ON public.simulado_grupos(pai_id) WHERE pai_id IS NOT NULL;
