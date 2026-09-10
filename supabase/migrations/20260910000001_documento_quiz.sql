-- "Questões do conteúdo" = mini-simulado da aula (SEPARADO das questões inline da leitura,
-- que ficam em simulado_documento_questoes ancoradas por artigo). Aqui é uma lista simples de
-- questões do banco + configuração (modo imediato/simulado, embaralhar).

CREATE TABLE IF NOT EXISTS public.simulado_documento_quiz_questoes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  documento_id uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  questao_id   uuid NOT NULL,
  ordem        integer NOT NULL DEFAULT 0,
  deletado     boolean NOT NULL DEFAULT false,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, questao_id)
);
CREATE INDEX IF NOT EXISTS idx_doc_quiz_documento ON public.simulado_documento_quiz_questoes(documento_id);

-- Config do quiz por documento (modo, embaralhar…): jsonb tolerante.
ALTER TABLE public.simulado_documentos ADD COLUMN IF NOT EXISTS quiz_config jsonb;

-- RLS por tenant (mesmo padrão das demais tabelas de leitura).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_documento_quiz_questoes'] LOOP
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
