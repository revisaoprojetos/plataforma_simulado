CREATE TABLE public.estudante_sessoes_ocultas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  estudante_id UUID NOT NULL REFERENCES public.estudantes(id) ON DELETE CASCADE,
  sessao_id UUID NOT NULL REFERENCES public.sessoes_prova(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (estudante_id, sessao_id)
);

CREATE INDEX idx_estudante_sessoes_ocultas_estudante
  ON public.estudante_sessoes_ocultas(estudante_id);

CREATE INDEX idx_estudante_sessoes_ocultas_sessao
  ON public.estudante_sessoes_ocultas(sessao_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.estudante_sessoes_ocultas TO authenticated;
GRANT ALL ON public.estudante_sessoes_ocultas TO service_role;

ALTER TABLE public.estudante_sessoes_ocultas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage estudante_sessoes_ocultas"
ON public.estudante_sessoes_ocultas FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));