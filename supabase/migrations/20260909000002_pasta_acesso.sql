-- Acesso a nível de MÓDULO (pasta folder_area='leitura'): grupos + alunos.
-- Mesma semântica das leituras: SEM atribuição = liberado a todos; COM = união grupos/alunos.

CREATE TABLE IF NOT EXISTS public.simulado_pasta_grupos (
  id         uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id  uuid NOT NULL,
  pasta_id   uuid NOT NULL REFERENCES public.simulado_pastas(id) ON DELETE CASCADE,
  grupo_id   uuid NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pasta_id, grupo_id)
);
CREATE INDEX IF NOT EXISTS idx_simulado_pasta_grupos_pasta ON public.simulado_pasta_grupos(pasta_id);

CREATE TABLE IF NOT EXISTS public.simulado_pasta_estudantes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  pasta_id     uuid NOT NULL REFERENCES public.simulado_pastas(id) ON DELETE CASCADE,
  estudante_id uuid NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pasta_id, estudante_id)
);
CREATE INDEX IF NOT EXISTS idx_simulado_pasta_estudantes_pasta ON public.simulado_pasta_estudantes(pasta_id);

-- RLS por tenant (mesmo padrão das tabelas de acesso do documento).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_pasta_grupos','simulado_pasta_estudantes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "tenant_isolation_%s" ON public.%I FOR ALL TO authenticated
      USING (tenant_id IN (SELECT public.user_tenant_ids()))
      WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))', t, t);
    EXECUTE format('GRANT ALL ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
