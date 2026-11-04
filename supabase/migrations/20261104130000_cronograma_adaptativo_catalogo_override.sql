-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA ADAPTATIVO · edição do CATÁLOGO DE METAS por plataforma (admin)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1 linha por tenant com o OVERLAY editado no admin (só o que mudou em relação ao catálogo-base:
-- aulas/links/ordem/ativas, aulas novas, metas de LegProc). `versao` entra no id do catálogo efetivo:
-- ao salvar, o id muda e os planos dos alunos migram sozinhos no próximo acesso (preservando o feito).
-- O código tolera a tabela ausente (sem overlay = comportamento atual), então o deploy não depende desta migração.

CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_catalogo (
  tenant_id     uuid PRIMARY KEY REFERENCES public.simulado_tenants(id) ON DELETE CASCADE,
  versao        integer     NOT NULL DEFAULT 1,
  dados         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);

-- Acesso só pelo service role (padrão das tabelas do cronograma): RLS ligado, sem policies.
ALTER TABLE public.simulado_cronograma_adaptativo_catalogo ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
