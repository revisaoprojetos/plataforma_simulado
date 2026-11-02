-- Produtos/Extensivos — Avisos/anúncios por produto (Fase 2.3).
-- O admin posta avisos num produto (aba Avisos do editor); o aluno vê na página do extensivo.
-- Aditivo, RLS por simulado_tenant_acessos (service role bypassa). Ver docs/produtos-extensivos-blueprint.md.

CREATE TABLE IF NOT EXISTS public.simulado_produto_avisos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  produto_id  uuid NOT NULL REFERENCES public.simulado_produtos(id) ON DELETE CASCADE,
  titulo      text NOT NULL,
  corpo       text,
  fixado      boolean NOT NULL DEFAULT false,
  ativo       boolean NOT NULL DEFAULT true,
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_produto_avisos_produto ON public.simulado_produto_avisos (produto_id, ativo);

DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.simulado_produto_avisos ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS simulado_produto_avisos_isolation ON public.simulado_produto_avisos';
  EXECUTE $p$CREATE POLICY simulado_produto_avisos_isolation ON public.simulado_produto_avisos
    USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))$p$;
END $$;
