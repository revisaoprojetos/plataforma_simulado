-- ============================================================================
-- Fase 3 (reorg multitenant) — COMPARTILHAMENTO POR CÓPIA (procedência)
-- Registra cada item copiado de uma plataforma p/ outra: origem → destino (a cópia).
-- O UNIQUE(destino_tenant_id, tipo, origem_id) é o DEDUP: não copia 2x a mesma origem
-- para o mesmo destino (re-executar é idempotente). Global (sem tenant_id próprio;
-- referencia origem e destino). RLS sem policy: só service role (super-admin global).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.simulado_compartilhamentos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  origem_tenant_id   uuid NOT NULL,
  destino_tenant_id  uuid NOT NULL,
  tipo               text NOT NULL,   -- 'questao' | 'banco' | 'estudante' | 'caderno'
  origem_id          uuid NOT NULL,   -- id no tenant de ORIGEM
  destino_id         uuid NOT NULL,   -- id da CÓPIA no tenant de DESTINO
  executado_por      uuid,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (destino_tenant_id, tipo, origem_id)
);

CREATE INDEX IF NOT EXISTS idx_compart_destino ON public.simulado_compartilhamentos (destino_tenant_id, tipo);

ALTER TABLE public.simulado_compartilhamentos ENABLE ROW LEVEL SECURITY;
