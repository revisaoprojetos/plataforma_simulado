-- Desafio de Jurisprudência (jogo arcade "JurisClub") — conteúdo + progresso.
-- O "desafio" é uma pasta folder_area='jurisprudencia' (reusa acesso/ticket/medalhas da Leitura).
-- O conteúdo do jogo (CONFIG + MATERIAS + FINAL + DIAS/teses + imagens anexadas) fica em
-- `desafio_jogo jsonb` na pasta. O progresso por aluno (dom/best/recorde) vai em tabela própria —
-- o ranking do jogo é por pontos de partida, não pelas respostas de leitura. Idempotente.
-- ⚠️ Aplicação MANUAL no SQL Editor. Não afeta o aluno (só adiciona coluna/tabela).

-- Conteúdo do jogo na pasta (1 pasta = 1 desafio).
ALTER TABLE public.simulado_pastas ADD COLUMN IF NOT EXISTS desafio_jogo jsonb;

-- Progresso por aluno no desafio (espelha o estado `S` do jogo: dom/best/recorde).
CREATE TABLE IF NOT EXISTS public.simulado_jurisprudencia_progresso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  desafio_id uuid NOT NULL,                      -- = simulado_pastas.id (folder_area='jurisprudencia')
  estudante_id uuid NOT NULL,
  dom jsonb NOT NULL DEFAULT '{}'::jsonb,         -- {dia: [índices de teses dominadas]}
  best jsonb NOT NULL DEFAULT '{}'::jsonb,        -- {dia: melhor pontuação}
  recorde integer NOT NULL DEFAULT 0,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (desafio_id, estudante_id)
);
CREATE INDEX IF NOT EXISTS idx_jurisprud_prog_desafio   ON public.simulado_jurisprudencia_progresso (desafio_id);
CREATE INDEX IF NOT EXISTS idx_jurisprud_prog_estudante ON public.simulado_jurisprudencia_progresso (tenant_id, estudante_id);
