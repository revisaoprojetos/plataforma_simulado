-- Tentativas do quiz "Questões do conteúdo" (LegProc Digital): cada vez que o aluno CONCLUI o quiz de
-- uma aula vira uma tentativa contabilizada (acertos/total/nota + snapshot). As respostas correntes
-- seguem em simulado_leitura_respostas (última resposta por questão) e o "Refazer" NÃO as apaga — assim
-- a trilha continua destravada; aqui fica o HISTÓRICO de tentativas.
CREATE TABLE IF NOT EXISTS public.simulado_leitura_quiz_tentativas (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  documento_id  uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  tentativa_num integer NOT NULL,
  acertos       integer NOT NULL DEFAULT 0,
  total         integer NOT NULL DEFAULT 0,
  nota          numeric,
  respostas     jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estudante_id, documento_id, tentativa_num)
);
CREATE INDEX IF NOT EXISTS idx_leitura_quiz_tent_est ON public.simulado_leitura_quiz_tentativas(estudante_id, documento_id);
CREATE INDEX IF NOT EXISTS idx_leitura_quiz_tent_doc ON public.simulado_leitura_quiz_tentativas(tenant_id, documento_id);

-- RLS por tenant (mesmo padrão das demais tabelas de leitura).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_leitura_quiz_tentativas'] LOOP
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
