
CREATE TABLE public.pastas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  descricao text,
  cor text,
  criada_por uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pastas TO authenticated;
GRANT ALL ON public.pastas TO service_role;

ALTER TABLE public.pastas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin manage pastas" ON public.pastas
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_pastas_updated_at
  BEFORE UPDATE ON public.pastas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.questoes
  ADD COLUMN pasta_id uuid REFERENCES public.pastas(id) ON DELETE SET NULL;

CREATE INDEX idx_questoes_pasta_id ON public.questoes(pasta_id);
