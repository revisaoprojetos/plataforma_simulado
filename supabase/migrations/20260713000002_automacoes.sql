-- Automações (aba "n8n" das Conexões): fluxos gatilho → ações, no estilo n8n.
-- gatilho = evento de progressão do estudante; passos = lista de nós (ações) em jsonb.
CREATE TABLE IF NOT EXISTS public.simulado_automacoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  nome       text NOT NULL,
  ativo      boolean NOT NULL DEFAULT true,
  gatilho    text,                       -- chave do evento (ex.: estudante.finalizou)
  passos     jsonb NOT NULL DEFAULT '[]', -- [{ id, tipo, nome, config }]
  ultimo_status text,
  ultimo_run timestamptz,
  criado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_automacoes_tenant ON public.simulado_automacoes (tenant_id, ativo);

ALTER TABLE public.simulado_automacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS simulado_automacoes_isolation ON public.simulado_automacoes;
CREATE POLICY simulado_automacoes_isolation ON public.simulado_automacoes
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));
