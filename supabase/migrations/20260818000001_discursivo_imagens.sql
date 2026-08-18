-- ═══════════════════════════════════════════════════════════════════════════
-- Simulados Discursivos — Fase 1: anexar IMAGENS (fotos) à resposta discursiva.
--
-- O aluno envia foto(s) da resposta manuscrita por questão. Cada foto é um
-- arquivo em `simulado_arquivos` (bucket PRIVADO); esta junção liga a resposta
-- (`simulado_respostas_discursivas`) às suas páginas, com ordem.
--
-- ⚠️ AÇÃO MANUAL no Supabase: crie um bucket de Storage PRIVADO chamado
--    `discursivas` (NÃO marque "Public bucket"). O backend serve por URL
--    assinada (getSignedUrl) — sem leitura pública.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_resposta_arquivos (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  resposta_id  uuid NOT NULL REFERENCES public.simulado_respostas_discursivas(id) ON DELETE CASCADE,
  arquivo_id   uuid NOT NULL REFERENCES public.simulado_arquivos(id) ON DELETE CASCADE,
  ordem        integer NOT NULL DEFAULT 0,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (resposta_id, arquivo_id)
);

CREATE INDEX IF NOT EXISTS idx_simulado_resposta_arquivos_resposta ON public.simulado_resposta_arquivos(resposta_id);
CREATE INDEX IF NOT EXISTS idx_simulado_resposta_arquivos_tenant   ON public.simulado_resposta_arquivos(tenant_id);

-- RLS no mesmo padrão das demais tabelas simulado_* (isolamento por tenant).
ALTER TABLE public.simulado_resposta_arquivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_simulado_resposta_arquivos" ON public.simulado_resposta_arquivos;
CREATE POLICY "tenant_isolation_simulado_resposta_arquivos" ON public.simulado_resposta_arquivos
  FOR ALL TO authenticated
  USING      (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.simulado_resposta_arquivos TO authenticated;
GRANT ALL ON public.simulado_resposta_arquivos TO service_role;
