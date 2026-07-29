-- ============================================================================
-- Notificações in-app do ALUNO (Fase 2). Persistente e escopada por estudante:
-- gabarito/nota liberados, resultado disponível, avisos de prazo etc. Aparecem no
-- sino do portal do aluno. RLS habilitado sem policy (service-role; actions/rotas
-- filtram por tenant_id + estudante_id no código) — mesmo padrão das demais.
--
-- ⚠️ Havia um ESQUELETO antigo/parcial desta tabela (faltavam colunas lida/link),
-- vazio e sem uso no código. Dropamos e recriamos com o schema completo. Seguro:
-- 0 linhas. Se sua base não tiver o esqueleto, o DROP IF EXISTS é no-op.
-- ============================================================================

DROP TABLE IF EXISTS public.simulado_notificacoes;

CREATE TABLE IF NOT EXISTS public.simulado_notificacoes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL,
  estudante_id uuid NOT NULL,
  tipo         text NOT NULL DEFAULT 'info',   -- 'info' | 'liberacao' | 'resultado' | 'alerta'
  titulo       text NOT NULL,
  mensagem     text,
  link         text,
  lida         boolean NOT NULL DEFAULT false,
  criado_em    timestamptz NOT NULL DEFAULT now()
);

-- lista do aluno: por estudante, não lidas primeiro, mais recentes no topo.
CREATE INDEX IF NOT EXISTS idx_notif_estudante ON public.simulado_notificacoes (estudante_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_notif_naolidas ON public.simulado_notificacoes (estudante_id, lida) WHERE lida = false;

ALTER TABLE public.simulado_notificacoes ENABLE ROW LEVEL SECURITY;
