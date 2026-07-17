-- Base/staging de assinaturas puxadas dos provedores (Guru, Curseduca, futuros).
-- A tela de Assinaturas LÊ desta tabela (rápido, sem tocar a API). A API só é chamada
-- no botão "Sincronizar", que faz UPSERT aqui. Assim a comparação/consulta do dia a dia
-- não sobrecarrega a chave de API (evita bloqueio por rate limit). Ver PLANO-INTEGRACOES.md.

CREATE TABLE IF NOT EXISTS public.simulado_integracao_base (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  provider           text NOT NULL,               -- 'curseduca' | 'guru' | ...
  ent_external_id    text NOT NULL,               -- id da assinatura/transação no provedor (dedupe)
  pessoa_external_id text,
  nome               text,
  email              text,                         -- normalizado (lower/trim)
  cpf                text,                          -- só dígitos
  telefone           text,
  produto_ref        text,
  produto_nome       text,
  status             text,                          -- ativo | cancelado | reembolsado | expirado
  inicio_em          timestamptz,
  expira_em          timestamptz,
  bruto              jsonb,                         -- item normalizado (auditoria/depuração)
  sincronizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, ent_external_id)
);
CREATE INDEX IF NOT EXISTS idx_integracao_base_tenant ON public.simulado_integracao_base (tenant_id, provider, status);
CREATE INDEX IF NOT EXISTS idx_integracao_base_email  ON public.simulado_integracao_base (tenant_id, provider, email);
CREATE INDEX IF NOT EXISTS idx_integracao_base_cpf    ON public.simulado_integracao_base (tenant_id, provider, cpf);

-- Metadados da última sincronização (mostrar "última sync há X" sem varrer a base).
ALTER TABLE public.simulado_integracao_config ADD COLUMN IF NOT EXISTS base_sync_em    timestamptz;
ALTER TABLE public.simulado_integracao_config ADD COLUMN IF NOT EXISTS base_sync_total integer;

-- RLS (o app usa service role e bypassa; mantém o padrão de isolamento por tenant).
ALTER TABLE public.simulado_integracao_base ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS simulado_integracao_base_isolation ON public.simulado_integracao_base;
CREATE POLICY simulado_integracao_base_isolation ON public.simulado_integracao_base
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));
