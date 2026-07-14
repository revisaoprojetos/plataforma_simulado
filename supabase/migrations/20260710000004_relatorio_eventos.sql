-- Rastreio de engajamento com relatórios/resultados por aluno.
-- Alimenta as métricas da Visão Geral do Relatório por Simulado:
--   visualizou → aluno abriu o resultado/relatório da própria sessão
--   baixou     → aluno (ou geração) baixou o PDF do resultado da sessão
CREATE TABLE IF NOT EXISTS public.simulado_relatorio_eventos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  simulado_id  uuid NOT NULL,
  estudante_id uuid,
  sessao_id    uuid,
  tipo         text NOT NULL CHECK (tipo IN ('visualizou', 'baixou')),
  criado_em    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rel_eventos_simulado ON public.simulado_relatorio_eventos (simulado_id, tipo);
CREATE INDEX IF NOT EXISTS idx_rel_eventos_estudante ON public.simulado_relatorio_eventos (estudante_id);

ALTER TABLE public.simulado_relatorio_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS simulado_relatorio_eventos_isolation ON public.simulado_relatorio_eventos;
CREATE POLICY simulado_relatorio_eventos_isolation ON public.simulado_relatorio_eventos
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));
