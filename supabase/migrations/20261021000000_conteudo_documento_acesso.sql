-- Controle de acesso dos DOCUMENTOS da Biblioteca de Conteúdos (módulo simulado_conteudo_*).
-- Espelha o par de tabelas da Leitura (simulado_documento_grupos/_estudantes), mas keyed por
-- simulado_conteudo_documentos — o acesso das PASTAS reusa simulado_pasta_grupos/_estudantes
-- (as pastas de conteúdo já vivem em simulado_pastas, folder_area='conteudo'/'conteudo_modelo').
--
-- Regra de visibilidade (padrão LIBERADO): SEM nenhuma atribuição = liberado a todos os alunos do
-- tenant; COM atribuição = só os grupos/estudantes atribuídos (união). A herança por pasta (um pai
-- bloqueado esconde a subárvore) é aplicada no gate do aluno (lib/conteudo/leitor.ts).

CREATE TABLE IF NOT EXISTS public.simulado_conteudo_documento_grupos (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  documento_id uuid NOT NULL REFERENCES public.simulado_conteudo_documentos(id) ON DELETE CASCADE,
  grupo_id     uuid NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, grupo_id)
);
CREATE INDEX IF NOT EXISTS idx_conteudo_doc_grupos_doc ON public.simulado_conteudo_documento_grupos(documento_id);

CREATE TABLE IF NOT EXISTS public.simulado_conteudo_documento_estudantes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  documento_id uuid NOT NULL REFERENCES public.simulado_conteudo_documentos(id) ON DELETE CASCADE,
  estudante_id uuid NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, estudante_id)
);
CREATE INDEX IF NOT EXISTS idx_conteudo_doc_estudantes_doc ON public.simulado_conteudo_documento_estudantes(documento_id);
CREATE INDEX IF NOT EXISTS idx_conteudo_doc_estudantes_est ON public.simulado_conteudo_documento_estudantes(estudante_id);

-- RLS por tenant (mesmo padrão simulado_*)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_conteudo_documento_grupos','simulado_conteudo_documento_estudantes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "tenant_isolation_%s" ON public.%I FOR ALL TO authenticated
      USING (tenant_id IN (SELECT public.user_tenant_ids()))
      WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))', t, t);
    EXECUTE format('GRANT ALL ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- Índice composto p/ as listagens escopadas por pasta (listarDocumentos, carregarArvoreAcesso .in(pasta_id),
-- gate do aluno). O índice existente é só (pasta_id); as queries sempre filtram tenant_id junto.
CREATE INDEX IF NOT EXISTS idx_conteudo_doc_tenant_pasta ON public.simulado_conteudo_documentos(tenant_id, pasta_id);

NOTIFY pgrst, 'reload schema';
