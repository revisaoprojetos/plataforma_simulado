-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA ADAPTATIVO — conteúdo vindo da plataforma (disciplinas + Biblioteca)
--
-- Substitui o seed por conteúdo REAL:
--  · a Biblioteca (simulado_conteudo_*) ganha vínculo com disciplina: a PASTA
--    (folder_area='conteudo') recebe `disciplina_id`. Os documentos publicados dessa
--    pasta (e subpastas) viram as AULAS daquela disciplina.
--  · cada VERSÃO de documento guarda `paginas` (contagem do PDF, preenchida
--    automaticamente ao ler o arquivo) — é o que o motor usa (duração = páginas ÷ ritmo).
--  · LEI SECA por semana (WLP) ganha tabela própria.
-- ═══════════════════════════════════════════════════════════════════════════

-- Vínculo disciplina ↔ pasta da Biblioteca.
ALTER TABLE public.simulado_pastas
  ADD COLUMN IF NOT EXISTS disciplina_id uuid REFERENCES public.simulado_disciplinas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pastas_disciplina ON public.simulado_pastas (tenant_id, disciplina_id) WHERE disciplina_id IS NOT NULL;

-- Contagem de páginas por versão de documento (preenchida ao ler o PDF).
ALTER TABLE public.simulado_conteudo_versoes
  ADD COLUMN IF NOT EXISTS paginas integer;

-- Lei seca por semana (WLP[semana][ordem] = texto do bloco).
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_legproc (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  semana     integer NOT NULL CHECK (semana >= 1),
  ordem      integer NOT NULL DEFAULT 0,
  texto      text NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_legproc
  ON public.simulado_cronograma_adaptativo_legproc (tenant_id, semana, ordem);

DO $$
DECLARE t text := 'simulado_cronograma_adaptativo_legproc';
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
  EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
    USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
END $$;

NOTIFY pgrst, 'reload schema';
