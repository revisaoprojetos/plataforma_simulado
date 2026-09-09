-- Ordenação de pastas (módulos do "banco de aulas" do LegProc, folder_area='leitura').
-- Aditiva e idempotente. RLS já existe em simulado_pastas.
ALTER TABLE public.simulado_pastas ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_simulado_pastas_area_ordem
  ON public.simulado_pastas(tenant_id, folder_area, pai_id, ordem);

NOTIFY pgrst, 'reload schema';
