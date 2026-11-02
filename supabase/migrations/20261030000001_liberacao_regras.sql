-- ─────────────────────────────────────────────────────────────────────────────
-- Regras de liberação de acesso via webhooks de venda — CAMADA DE REGRAS.
-- Ver PROMPT_REGRAS_LIBERACAO_ACESSO.md. Roda APÓS 20261030000000_produtos_extensivos.sql
-- (que cria o CATÁLOGO: simulado_produtos + _fontes + _itens). Aqui ficam só as REGRAS
-- (AND estrito), os PEDIDOS normalizados, as CONCESSÕES (access_grants com datas/ciclo) e o
-- mapeamento de status editável. As regras concedem PRODUTOS do catálogo deles.
--
-- Prioridade de gatilho (decisão): regra casou → manda (grants); nada casou → fallback
-- auto-map + fontes do produto (simulado_assinaturas), no engine existente.
--
-- Padrão do projeto: RLS por public.user_tenant_ids(); o app usa createAdminClient (service role).
-- ─────────────────────────────────────────────────────────────────────────────

-- UNIFICAÇÃO: o catálogo canônico do "o que o produto libera" é simulado_produto_itens
-- (de 20261030000000_produtos_extensivos.sql). Uma tentativa anterior criou simulado_produto_entitlements
-- como alternativa — abandonada. Remove o órfão se existir (nada no código o usa mais).
DROP TABLE IF EXISTS public.simulado_produto_entitlements;

-- A) REGRAS DE LIBERAÇÃO ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simulado_liberacao_regras (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  nome          text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','canceled')),
  prioridade    integer NOT NULL DEFAULT 100,  -- menor = mais prioritária (desempate; TODAS que casam aplicam)
  filtros       jsonb NOT NULL DEFAULT '{}',   -- RegraFiltros (plataformas/produtos/ofertas/período)
  inicio        jsonb NOT NULL DEFAULT '{"tipo":"immediate"}',   -- InicioConfig
  fim           jsonb NOT NULL DEFAULT '{"tipo":"lifetime"}',    -- FimConfig
  paused_at     timestamptz,
  canceled_at   timestamptz,
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_regras_tenant ON public.simulado_liberacao_regras (tenant_id, status, prioridade);

-- Produtos (do catálogo deles) que a regra concede — N:N. "features" da regra.
CREATE TABLE IF NOT EXISTS public.simulado_liberacao_regra_produtos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  regra_id    uuid NOT NULL REFERENCES public.simulado_liberacao_regras(id) ON DELETE CASCADE,
  produto_id  uuid NOT NULL REFERENCES public.simulado_produtos(id) ON DELETE CASCADE,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regra_id, produto_id)
);
CREATE INDEX IF NOT EXISTS idx_regra_produtos_regra ON public.simulado_liberacao_regra_produtos (regra_id);

-- B) PEDIDOS normalizados (nunca descartados; reavaliáveis) ----------------------
CREATE TABLE IF NOT EXISTS public.simulado_liberacao_pedidos (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            uuid NOT NULL,
  provider             text NOT NULL,          -- plataforma (slug)
  pedido_id            text NOT NULL,           -- id do pedido na plataforma
  produto_ref_id       text,
  produto_nome         text,
  oferta_ref_id        text,
  oferta_nome          text,
  comprador_nome       text,
  comprador_email      text,                    -- normalizado (trim+minúsculas) — chave de identidade
  comprador_telefone   text,
  valor_centavos       bigint,                  -- dinheiro em inteiro (centavos), nunca float
  moeda                text,
  valor_local_centavos bigint,
  data_compra          timestamptz,             -- UTC (nunca a data de recebimento do webhook)
  status_bruto         text,
  status_classificacao text CHECK (status_classificacao IN ('positive','negative','neutral')),
  processing_state     text NOT NULL DEFAULT 'pending'
                         CHECK (processing_state IN ('pending','granted','no_matching_rule','blocked_by_paused_rule','revoked','ignored')),
  event_id             text,                    -- liga ao evento de webhook de origem
  payload              jsonb NOT NULL DEFAULT '{}',
  ultima_avaliacao_em  timestamptz,
  criado_em            timestamptz NOT NULL DEFAULT now(),
  atualizado_em        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, pedido_id)
);
CREATE INDEX IF NOT EXISTS idx_pedidos_tenant ON public.simulado_liberacao_pedidos (tenant_id, provider, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_pedidos_pstate ON public.simulado_liberacao_pedidos (tenant_id, processing_state);
CREATE INDEX IF NOT EXISTS idx_pedidos_email  ON public.simulado_liberacao_pedidos (tenant_id, comprador_email);

-- C) CONCESSÕES (access_grants) — fonte de verdade do acesso por REGRA de venda ---
CREATE TABLE IF NOT EXISTS public.simulado_access_grants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  produto_id    uuid NOT NULL REFERENCES public.simulado_produtos(id) ON DELETE CASCADE,
  pedido_id     uuid REFERENCES public.simulado_liberacao_pedidos(id) ON DELETE CASCADE,
  regra_id      uuid REFERENCES public.simulado_liberacao_regras(id) ON DELETE SET NULL,
  inicio_em     timestamptz NOT NULL,
  fim_em        timestamptz,                   -- NULL = vitalício
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('scheduled','active','expired','revoked')),
  revogado_em   timestamptz,
  motivo_revogacao text,                       -- 'refunded' | 'rule_changed' | 'rule_canceled' | ...
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pedido_id, regra_id, produto_id)      -- idempotência: 1 concessão por (pedido,regra,produto)
);
CREATE INDEX IF NOT EXISTS idx_grants_estudante ON public.simulado_access_grants (estudante_id, status, fim_em);
CREATE INDEX IF NOT EXISTS idx_grants_produto   ON public.simulado_access_grants (tenant_id, produto_id, status);
CREATE INDEX IF NOT EXISTS idx_grants_regra     ON public.simulado_access_grants (regra_id);
CREATE INDEX IF NOT EXISTS idx_grants_transicao ON public.simulado_access_grants (status, inicio_em, fim_em)
  WHERE status IN ('scheduled','active');

-- D) MAPEAMENTO DE STATUS editável (sem deploy) ----------------------------------
CREATE TABLE IF NOT EXISTS public.simulado_status_mappings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid NOT NULL,
  provider          text NOT NULL DEFAULT '',  -- '' = qualquer provedor
  valor_normalizado text NOT NULL,              -- status normalizado (minúsculas/sem acento/`_`)
  classificacao     text NOT NULL CHECK (classificacao IN ('positive','negative','neutral')),
  criado_em         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, valor_normalizado)
);
CREATE INDEX IF NOT EXISTS idx_status_map_tenant ON public.simulado_status_mappings (tenant_id, provider);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS por tenant (mesmo padrão de simulado_pasta_acesso).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_liberacao_regras','simulado_liberacao_regra_produtos',
    'simulado_liberacao_pedidos','simulado_access_grants','simulado_status_mappings'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "tenant_isolation_%s" ON public.%I FOR ALL TO authenticated
      USING (tenant_id IN (SELECT public.user_tenant_ids()))
      WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))', t, t);
    EXECUTE format('GRANT ALL ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
