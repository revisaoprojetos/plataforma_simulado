-- ═══════════════════════════════════════════════════════════════════════════
-- Lei Seca — Fase A / A5: BUSCA no acervo (tsvector + GIN).
--
-- Coluna GERADA (auto-mantida, sem trigger) sobre título/número/ementa/tipo →
-- busca escalável no catálogo. A busca "dentro da lei" é client-side no leitor.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_documentos
  ADD COLUMN IF NOT EXISTS busca_tsv tsvector
  GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      coalesce(titulo, '') || ' ' || coalesce(titulo_oficial, '') || ' ' ||
      coalesce(ementa, '') || ' ' || coalesce(numero, '') || ' ' ||
      coalesce(tipo_norma, '') || ' ' || coalesce(ano::text, ''))
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_simulado_documentos_busca ON public.simulado_documentos USING gin(busca_tsv);

NOTIFY pgrst, 'reload schema';
