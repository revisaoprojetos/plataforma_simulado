-- Status enum
DO $$ BEGIN
  CREATE TYPE public.questao_status AS ENUM ('ativa', 'em_revisao', 'arquivada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.questoes
  ADD COLUMN IF NOT EXISTS codigo_externo text,
  ADD COLUMN IF NOT EXISTS assunto text,
  ADD COLUMN IF NOT EXISTS status public.questao_status NOT NULL DEFAULT 'ativa';

UPDATE public.questoes
  SET status = CASE WHEN ativa THEN 'ativa'::public.questao_status ELSE 'arquivada'::public.questao_status END
  WHERE status IS NULL OR (ativa = false AND status = 'ativa');

CREATE INDEX IF NOT EXISTS idx_questoes_status ON public.questoes(status);
CREATE INDEX IF NOT EXISTS idx_questoes_codigo_externo ON public.questoes(codigo_externo);

-- Many-to-many questao <-> pasta
CREATE TABLE IF NOT EXISTS public.questao_pasta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  questao_id uuid NOT NULL REFERENCES public.questoes(id) ON DELETE CASCADE,
  pasta_id uuid NOT NULL REFERENCES public.pastas(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(questao_id, pasta_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.questao_pasta TO authenticated;
GRANT ALL ON public.questao_pasta TO service_role;

ALTER TABLE public.questao_pasta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin manage questao_pasta" ON public.questao_pasta;
CREATE POLICY "admin manage questao_pasta" ON public.questao_pasta
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_questao_pasta_questao ON public.questao_pasta(questao_id);
CREATE INDEX IF NOT EXISTS idx_questao_pasta_pasta ON public.questao_pasta(pasta_id);

-- Backfill: copy existing single pasta_id into m2m
INSERT INTO public.questao_pasta (questao_id, pasta_id)
SELECT id, pasta_id FROM public.questoes WHERE pasta_id IS NOT NULL
ON CONFLICT (questao_id, pasta_id) DO NOTHING;