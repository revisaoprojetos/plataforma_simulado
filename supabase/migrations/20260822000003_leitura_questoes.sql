-- ═══════════════════════════════════════════════════════════════════════════
-- Área de LEITURA — Fase 2: QUESTÕES no meio da leitura.
--
-- Entre artigos pré-determinados, o admin insere uma questão (do banco). O aluno
-- responde inline; a resposta é validada e guardada no servidor (idempotente).
-- Conclusão do desafio pode exigir responder as questões obrigatórias.
-- ═══════════════════════════════════════════════════════════════════════════

-- 6) Pontos de inserção de questão (após um artigo/seção `data-art`)
CREATE TABLE IF NOT EXISTS public.simulado_documento_questoes (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  documento_id     uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  documento_versao integer NOT NULL,
  questao_id       uuid NOT NULL,           -- FK "mole" p/ simulado_questoes
  apos_artigo      integer NOT NULL,        -- inserir depois deste artigo (data-art)
  obrigatoria      boolean NOT NULL DEFAULT true,
  ordem            integer NOT NULL DEFAULT 0,
  deletado         boolean NOT NULL DEFAULT false,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, documento_versao, questao_id)
);
CREATE INDEX IF NOT EXISTS idx_simulado_doc_questoes_doc ON public.simulado_documento_questoes(documento_id, documento_versao);

-- 7) Respostas do aluno às questões inline (espelha simulado_respostas_objetivas)
CREATE TABLE IF NOT EXISTS public.simulado_leitura_respostas (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  estudante_id      uuid NOT NULL,
  documento_id      uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  questao_id        uuid NOT NULL,
  alternativa_id    uuid NOT NULL,
  correta           boolean NOT NULL,
  snapshot_gabarito jsonb,
  respondido_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estudante_id, documento_id, questao_id)
);
CREATE INDEX IF NOT EXISTS idx_simulado_leitura_resp_est ON public.simulado_leitura_respostas(estudante_id, documento_id);

-- RLS por tenant (mesmo padrão simulado_*)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_documento_questoes','simulado_leitura_respostas'] LOOP
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
