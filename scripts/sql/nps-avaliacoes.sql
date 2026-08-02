-- =====================================================================
-- NPS / Avaliação de satisfação do aluno (rodar no SQL Editor do Supabase).
-- Uma avaliação por aluno × simulado (UNIQUE) — reenviar ATUALIZA (upsert).
-- RLS habilitado sem policy (padrão service-role; o app filtra por tenant no código).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.simulado_avaliacoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  estudante_id uuid NOT NULL,
  simulado_id  uuid NOT NULL,
  sessao_id    uuid,
  nps          smallint NOT NULL CHECK (nps BETWEEN 0 AND 10),
  comentario   text,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estudante_id, simulado_id)
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_tenant ON public.simulado_avaliacoes (tenant_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_avaliacoes_simulado ON public.simulado_avaliacoes (simulado_id);

ALTER TABLE public.simulado_avaliacoes ENABLE ROW LEVEL SECURITY;
