
CREATE TABLE IF NOT EXISTS public.grupos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  cor text,
  arquivado boolean NOT NULL DEFAULT false,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupos TO authenticated;
GRANT ALL ON public.grupos TO service_role;
ALTER TABLE public.grupos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage grupos" ON public.grupos
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS trg_grupos_updated_at ON public.grupos;
CREATE TRIGGER trg_grupos_updated_at
BEFORE UPDATE ON public.grupos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.grupo_membros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  estudante_id uuid NOT NULL REFERENCES public.estudantes(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, estudante_id)
);
CREATE INDEX IF NOT EXISTS grupo_membros_estudante_idx ON public.grupo_membros(estudante_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupo_membros TO authenticated;
GRANT ALL ON public.grupo_membros TO service_role;
ALTER TABLE public.grupo_membros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage grupo_membros" ON public.grupo_membros
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.grupo_simulado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grupo_id uuid NOT NULL REFERENCES public.grupos(id) ON DELETE CASCADE,
  simulado_id uuid NOT NULL REFERENCES public.simulados(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grupo_id, simulado_id)
);
CREATE INDEX IF NOT EXISTS grupo_simulado_simulado_idx ON public.grupo_simulado(simulado_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grupo_simulado TO authenticated;
GRANT ALL ON public.grupo_simulado TO service_role;
ALTER TABLE public.grupo_simulado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage grupo_simulado" ON public.grupo_simulado
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
