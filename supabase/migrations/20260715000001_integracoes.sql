-- Sistema unificado de Integrações (Curseduca, Guru, futuros provedores).
-- Ver PLANO-INTEGRACOES.md. Tabelas ADITIVAS — não tocam nas simulado_curseduca_*
-- existentes (a migração de dados Curseduca→genérico é uma etapa posterior).
-- Padrão do projeto: RLS por simulado_tenant_acessos; o app usa createAdminClient (service role) que bypassa RLS.

-- Helper de policy (repetido em cada tabela): isolamento por tenant do usuário logado.
-- (mantido inline para não depender de função; segue o padrão das demais migrations)

-- ─────────────────────────────────────────────────────────────────────────────
-- Credenciais/config por tenant × provedor (generaliza simulado_curseduca_config)
CREATE TABLE IF NOT EXISTS public.simulado_integracao_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  provider      text NOT NULL,                 -- 'curseduca' | 'guru' | ...
  base_url      text,
  credenciais   jsonb NOT NULL DEFAULT '{}',   -- segredos criptografados (enc:v1:...) por campo
  webhook_token text,                          -- token único do tenant p/ a URL de webhook (Guru)
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider)
);
CREATE INDEX IF NOT EXISTS idx_integracao_config_tenant ON public.simulado_integracao_config (tenant_id, provider);
CREATE UNIQUE INDEX IF NOT EXISTS idx_integracao_config_webhook ON public.simulado_integracao_config (webhook_token) WHERE webhook_token IS NOT NULL;

-- Mapeamento produto/oferta/grupo do provedor → destino no sistema (classificação/grupo/simulado)
CREATE TABLE IF NOT EXISTS public.simulado_integracao_mapeamentos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  provider      text NOT NULL,
  fonte_ref     text NOT NULL,                 -- id do produto (Guru) ou grupo (Curseduca)
  fonte_nome    text,                          -- rótulo p/ exibição
  classificacao text,                          -- 'passaporte' | 'normal' | ...
  grupo_id      uuid,                          -- simulado_grupos (opcional)
  simulado_id   uuid,                          -- simulado_simulados (opcional)
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, fonte_ref)
);
CREATE INDEX IF NOT EXISTS idx_integracao_map_tenant ON public.simulado_integracao_mapeamentos (tenant_id, provider);

-- Regras de sincronização/polling (generaliza simulado_curseduca_sync)
CREATE TABLE IF NOT EXISTS public.simulado_integracao_sync (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  provider        text NOT NULL,
  tipo            text NOT NULL DEFAULT 'import',   -- 'import' | 'reconciliacao'
  fontes          jsonb NOT NULL DEFAULT '[]',      -- grupos/produtos selecionados
  destino         jsonb NOT NULL DEFAULT '{}',
  sincronizar     boolean NOT NULL DEFAULT false,   -- remove quem saiu (Curseduca)
  intervalo_min   integer NOT NULL DEFAULT 60,
  ativo           boolean NOT NULL DEFAULT true,
  ultima_execucao timestamptz,
  ultimo_resultado jsonb,
  criado_por      uuid,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integracao_sync_tenant ON public.simulado_integracao_sync (tenant_id, provider, ativo);

-- Fila de jobs assíncronos (generaliza simulado_curseduca_jobs)
CREATE TABLE IF NOT EXISTS public.simulado_integracao_jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  provider      text NOT NULL,
  tipo          text NOT NULL DEFAULT 'import',   -- 'import' | 'reconciliacao' | 'evento'
  status        text NOT NULL DEFAULT 'pendente', -- pendente | processando | concluido | erro
  payload       jsonb NOT NULL DEFAULT '{}',
  resultado     jsonb,
  erro          text,
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_integracao_jobs_pend ON public.simulado_integracao_jobs (provider, status, criado_em) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS idx_integracao_jobs_tenant ON public.simulado_integracao_jobs (tenant_id, provider, criado_em DESC);

-- Log idempotente de eventos de webhook (Guru)
CREATE TABLE IF NOT EXISTS public.simulado_integracao_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  provider      text NOT NULL,
  event_id      text NOT NULL,                  -- id do evento/transação no provedor (idempotência)
  tipo          text,                           -- tipo bruto do evento
  status        text NOT NULL DEFAULT 'recebido', -- recebido | processado | erro | ignorado
  payload       jsonb NOT NULL DEFAULT '{}',
  erro          text,
  recebido_em   timestamptz NOT NULL DEFAULT now(),
  processado_em timestamptz,
  UNIQUE (provider, event_id)
);
CREATE INDEX IF NOT EXISTS idx_integracao_eventos_tenant ON public.simulado_integracao_eventos (tenant_id, provider, recebido_em DESC);
CREATE INDEX IF NOT EXISTS idx_integracao_eventos_status ON public.simulado_integracao_eventos (status) WHERE status = 'recebido';

-- Identidade cross-provider: external ids de uma pessoa por provedor (evita duplicar aluno)
CREATE TABLE IF NOT EXISTS public.simulado_integracao_pessoas (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  estudante_id uuid NOT NULL,
  provider     text NOT NULL,
  external_id  text NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_id)
);
CREATE INDEX IF NOT EXISTS idx_integracao_pessoas_est ON public.simulado_integracao_pessoas (estudante_id);

-- Ciclo de vida do acesso por aluno × produto (concede/revoga)
CREATE TABLE IF NOT EXISTS public.simulado_assinaturas (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             uuid NOT NULL,
  estudante_id          uuid NOT NULL,
  provider              text NOT NULL,
  produto_ref           text,
  external_id           text NOT NULL,          -- id da assinatura/transação no provedor
  status                text NOT NULL DEFAULT 'ativo', -- ativo | cancelado | reembolsado | expirado
  confirmado_curseduca  boolean NOT NULL DEFAULT false, -- reconciliação: caiu no grupo esperado?
  inicio_em             timestamptz,
  expira_em             timestamptz,
  criado_em             timestamptz NOT NULL DEFAULT now(),
  atualizado_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_id)
);
CREATE INDEX IF NOT EXISTS idx_assinaturas_est ON public.simulado_assinaturas (estudante_id, status);
CREATE INDEX IF NOT EXISTS idx_assinaturas_tenant ON public.simulado_assinaturas (tenant_id, provider, status);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: isolamento por tenant do usuário logado (o app usa service role, que bypassa).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_integracao_config','simulado_integracao_mapeamentos','simulado_integracao_sync',
    'simulado_integracao_jobs','simulado_integracao_eventos','simulado_integracao_pessoas','simulado_assinaturas'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
    EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
      USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
  END LOOP;
END $$;

-- Estudante: de qual provedor veio (opcional; matricula_externa continua guardando o id)
ALTER TABLE public.simulado_estudantes ADD COLUMN IF NOT EXISTS origem_provider text;
