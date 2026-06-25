ALTER TABLE public.sessoes_prova
  ADD COLUMN IF NOT EXISTS arquivada boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sessoes_estudante_arquivada
  ON public.sessoes_prova(estudante_id, arquivada);