-- ============================================================================
-- LGPD — Solicitações de direitos do titular (Fase 1 do plano, faltava).
-- O aluno (titular) pode pedir EXPORTAÇÃO (acesso/portabilidade) — atendida na hora,
-- self-service, sem depender desta tabela — ou EXCLUSÃO, que abre uma solicitação
-- para o admin do tenant processar (anonimização controlada). Auditado.
-- RLS habilitado sem policy: só service role (as actions usam createAdminClient e
-- filtram por tenant_id no código) — mesmo padrão de simulado_compartilhamentos.
--
-- ⚠️ Havia um ESQUELETO antigo desta tabela (schema global: user_id, SEM tenant_id),
-- vazio e sem uso no código. Dropamos e recriamos com o schema correto (por tenant/
-- estudante). Seguro: 0 linhas. Se sua base não tiver o esqueleto, o DROP IF EXISTS é no-op.
-- ============================================================================

DROP TABLE IF EXISTS public.simulado_lgpd_solicitacoes;

CREATE TABLE IF NOT EXISTS public.simulado_lgpd_solicitacoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  estudante_id   uuid NOT NULL,
  tipo           text NOT NULL,                     -- 'exportacao' | 'exclusao' | 'portabilidade'
  status         text NOT NULL DEFAULT 'pendente',  -- 'pendente' | 'concluida' | 'rejeitada'
  canal          text NOT NULL DEFAULT 'aluno',     -- 'aluno' (self-service) | 'admin'
  motivo         text,                              -- do titular ou do admin (na rejeição)
  processado_por uuid,
  processado_em  timestamptz,
  criado_em      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lgpd_solic_tenant ON public.simulado_lgpd_solicitacoes (tenant_id, status, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_lgpd_solic_est ON public.simulado_lgpd_solicitacoes (estudante_id, tipo, status);

ALTER TABLE public.simulado_lgpd_solicitacoes ENABLE ROW LEVEL SECURITY;
