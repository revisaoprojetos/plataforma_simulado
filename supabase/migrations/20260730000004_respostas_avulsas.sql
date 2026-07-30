-- Respostas AVULSAS do aluno no Banco de Questões (prática fora de simulado).
-- Cada tentativa é um registro (histórico) — o aluno pode refazer quantas vezes quiser.
-- Base do relatório de desempenho por questão/conteúdo no perfil do estudante.
-- Filtram por tenant_id + estudante_id no código (mesmo padrão das demais tabelas migradas).

CREATE TABLE IF NOT EXISTS public.simulado_respostas_avulsas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  estudante_id   uuid NOT NULL,
  questao_id     uuid NOT NULL,
  alternativa_id uuid,
  disciplina_id  uuid,
  correta        boolean NOT NULL DEFAULT false,
  respondido_em  timestamptz NOT NULL DEFAULT now()
);

-- Histórico do aluno (mais recentes primeiro) e agregação por disciplina no tenant.
CREATE INDEX IF NOT EXISTS idx_rav_estudante ON public.simulado_respostas_avulsas (estudante_id, respondido_em DESC);
CREATE INDEX IF NOT EXISTS idx_rav_tenant_disc ON public.simulado_respostas_avulsas (tenant_id, disciplina_id);
CREATE INDEX IF NOT EXISTS idx_rav_estudante_questao ON public.simulado_respostas_avulsas (estudante_id, questao_id);

-- RLS ligado (acesso via service role no código, como as demais).
ALTER TABLE public.simulado_respostas_avulsas ENABLE ROW LEVEL SECURITY;
