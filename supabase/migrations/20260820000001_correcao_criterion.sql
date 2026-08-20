-- ═══════════════════════════════════════════════════════════════════════════
-- Discursivas — Mesa AURÉA v2: campos do "Criterion" (auditoria quesito a quesito).
--
-- simulado_competencias ganha o ESPELHO do quesito (descricao) e a GRADAÇÃO de
-- conceitos (conceitos jsonb = [{nome, pontos}]). simulado_correcao_competencias
-- ganha os campos que o corretor/IA preenche: conceito escolhido, trecho do aluno
-- (excerpt + página/linhas), alcançado/faltou e a marca de leitura duvidosa.
-- Tudo opcional/tolerante — a UI degrada se as colunas ainda não existirem.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_competencias
  ADD COLUMN IF NOT EXISTS descricao text,   -- espelho do quesito (o que se espera)
  ADD COLUMN IF NOT EXISTS conceitos jsonb;  -- [{ "nome": "Conceito 2", "pontos": 1.0 }, ...]

ALTER TABLE public.simulado_correcao_competencias
  ADD COLUMN IF NOT EXISTS conceito         text,
  ADD COLUMN IF NOT EXISTS excerpt          text,      -- trecho/transcrição do aluno
  ADD COLUMN IF NOT EXISTS pagina           text,
  ADD COLUMN IF NOT EXISTS linhas           text,
  ADD COLUMN IF NOT EXISTS recognized       text[],    -- alcançado
  ADD COLUMN IF NOT EXISTS missing          text[],    -- faltou / equivocado
  ADD COLUMN IF NOT EXISTS leitura_duvidosa boolean DEFAULT false;
