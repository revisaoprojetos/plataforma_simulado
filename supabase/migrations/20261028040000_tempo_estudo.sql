-- Fase 2 do "Meu Desempenho": CONTABILIDADE DE TEMPO DE ESTUDO.
-- Ledger diário (BRT) de segundos estudados por FRENTE, alimentado nos pontos de atividade que já
-- existem (finalização de simulado = duração da sessão; leitor de lei seca/jurisprudência = tempo_inc).
-- Daí saem: horas estudadas por período, tempo por frente/semana, divisão do tempo e ritmo (págs/h).
-- Upsert-incremento por (tenant, estudante, dia, frente) → idempotente e barato.
--
-- Também cria a tabela de SNAPSHOT do desempenho (referenciada por lib/desempenho/snapshot.ts e que
-- nunca havia sido criada — sem ela o snapshot recomputava a cada render).

-- ───────────────────────────── 1) Ledger de tempo de estudo ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.simulado_tempo_estudo (
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  dia           date NOT NULL,                -- dia BRT (America/Sao_Paulo)
  frente        text NOT NULL CHECK (frente IN ('leitura','legproc','jurisclub','simulado')),
  segundos      integer NOT NULL DEFAULT 0,
  paginas       integer NOT NULL DEFAULT 0,   -- p/ ritmo (págs/h) quando a frente informar páginas
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, estudante_id, dia, frente)
);
CREATE INDEX IF NOT EXISTS idx_tempo_estudo_aluno_dia
  ON public.simulado_tempo_estudo (tenant_id, estudante_id, dia DESC);

ALTER TABLE public.simulado_tempo_estudo ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  DROP POLICY IF EXISTS tempo_estudo_tenant ON public.simulado_tempo_estudo;
  CREATE POLICY tempo_estudo_tenant ON public.simulado_tempo_estudo
    USING (tenant_id IN (SELECT public.user_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
END $$;

-- ───────────────────────────── 2) Snapshot do desempenho (cache) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.simulado_desempenho_snapshot (
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL PRIMARY KEY,   -- onConflict: 'estudante_id'
  dia           text NOT NULL,               -- dia BRT da computação (invalida ao virar o dia)
  dados         jsonb NOT NULL,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_desempenho_snapshot_tenant
  ON public.simulado_desempenho_snapshot (tenant_id);

ALTER TABLE public.simulado_desempenho_snapshot ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  DROP POLICY IF EXISTS desempenho_snapshot_tenant ON public.simulado_desempenho_snapshot;
  CREATE POLICY desempenho_snapshot_tenant ON public.simulado_desempenho_snapshot
    USING (tenant_id IN (SELECT public.user_tenant_ids()))
    WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));
END $$;

-- APÓS APLICAR: NOTIFY pgrst, 'reload schema';
