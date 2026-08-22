-- ═══════════════════════════════════════════════════════════════════════════
-- Lei Seca — Fase A / A3: DISPOSITIVOS estruturados (artigo/§/inciso/alínea…).
--
-- Índice estrutural derivado do conteúdo, com id ESTÁVEL (derivado do rótulo, não
-- da posição) → sustenta índice lateral, deep-link, anterior/seguinte e re-âncora
-- de anotações entre versões. Uma linha por dispositivo POR VERSÃO.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_lei_dispositivos (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  documento_id      uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  versao            integer NOT NULL,
  id_estavel        text NOT NULL,     -- ex.: art-5, art-5.par-1, art-5.par-1.inc-ii
  tipo              text NOT NULL,     -- titulo|capitulo|secao|artigo|paragrafo|inciso|alinea|item
  rotulo            text,              -- "Art. 5º", "§ 1º", "II", "a)"
  caminho           text,              -- hierárquico (= id_estavel)
  ordem             integer NOT NULL DEFAULT 0,
  texto_normalizado text,
  hash              text,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, versao, id_estavel)
);
CREATE INDEX IF NOT EXISTS idx_simulado_lei_disp_doc ON public.simulado_lei_dispositivos(documento_id, versao, ordem);

ALTER TABLE public.simulado_lei_dispositivos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_simulado_lei_dispositivos" ON public.simulado_lei_dispositivos;
CREATE POLICY "tenant_isolation_simulado_lei_dispositivos" ON public.simulado_lei_dispositivos
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
GRANT ALL ON public.simulado_lei_dispositivos TO authenticated;
GRANT ALL ON public.simulado_lei_dispositivos TO service_role;

NOTIFY pgrst, 'reload schema';
