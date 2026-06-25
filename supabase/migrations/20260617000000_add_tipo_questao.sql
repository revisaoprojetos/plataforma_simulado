
ALTER TABLE public.questoes
  ADD COLUMN IF NOT EXISTS tipo TEXT
    CHECK (tipo IN ('Lei seca', 'Jurisprudência', 'Doutrina'));
