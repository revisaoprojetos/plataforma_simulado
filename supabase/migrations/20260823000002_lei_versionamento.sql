-- ═══════════════════════════════════════════════════════════════════════════
-- Lei Seca — Fase A / A2: VERSIONAMENTO (rascunho × publicada imutável) + relatório.
--
-- Editar passa a mutar o RASCUNHO; publicar cria uma versão IMUTÁVEL e vira o
-- ponteiro `versao_publicada` (o que o aluno lê). Aditivo + backfill idempotente:
-- documentos existentes viram publicada=rascunho=versao atual, sem mudar leitura.
-- ═══════════════════════════════════════════════════════════════════════════

-- Ponteiros de versão no documento --------------------------------------------
ALTER TABLE public.simulado_documentos
  ADD COLUMN IF NOT EXISTS versao_publicada integer,
  ADD COLUMN IF NOT EXISTS versao_rascunho  integer;

-- Backfill (só onde ainda está nulo → idempotente).
UPDATE public.simulado_documentos
  SET versao_publicada = COALESCE(versao_publicada, versao),
      versao_rascunho  = COALESCE(versao_rascunho, versao)
  WHERE versao_publicada IS NULL OR versao_rascunho IS NULL;

-- Estado por versão de conteúdo (append-only) ---------------------------------
ALTER TABLE public.simulado_documento_conteudos
  ADD COLUMN IF NOT EXISTS estado        text DEFAULT 'publicada', -- rascunho | publicada
  ADD COLUMN IF NOT EXISTS plain_text    text,
  ADD COLUMN IF NOT EXISTS publicado_em  timestamptz,
  ADD COLUMN IF NOT EXISTS publicado_por uuid;

-- Estado de re-âncora de anotação após republicação ---------------------------
ALTER TABLE public.simulado_leitura_anotacoes
  ADD COLUMN IF NOT EXISTS revisao_necessaria boolean NOT NULL DEFAULT false;

-- Relatório público de atualização --------------------------------------------
CREATE TABLE IF NOT EXISTS public.simulado_lei_atualizacoes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  documento_id uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  versao       integer NOT NULL,
  data         date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Fortaleza')::date,
  tipo         text NOT NULL DEFAULT 'alteracao', -- nova_lei|alteracao|revogacao|correcao_editorial
  descricao    text,
  dispositivos text[],
  criado_por   uuid,
  criado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_simulado_lei_atualizacoes_doc ON public.simulado_lei_atualizacoes(documento_id, versao);

-- RLS por tenant na tabela nova.
ALTER TABLE public.simulado_lei_atualizacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_simulado_lei_atualizacoes" ON public.simulado_lei_atualizacoes;
CREATE POLICY "tenant_isolation_simulado_lei_atualizacoes" ON public.simulado_lei_atualizacoes
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.simulado_lei_atualizacoes TO authenticated;
GRANT ALL ON public.simulado_lei_atualizacoes TO service_role;

NOTIFY pgrst, 'reload schema';
