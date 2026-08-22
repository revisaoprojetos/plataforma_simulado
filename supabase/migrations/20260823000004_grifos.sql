-- ═══════════════════════════════════════════════════════════════════════════
-- Lei Seca — Fase A / A4: GRIFOS EDITORIAIS semânticos.
--
-- Grifos são anotações BASE com um TIPO semântico (núcleo/complemento/prazo/
-- exceção/comentário/STF/STJ/TST/alerta) + editorial=true. São conteúdo
-- compartilhado (não clonado por aluno) e o leitor os pinta por tipo + rótulo,
-- com "modo sem grifos". disp_id/offsets preparam a re-âncora por dispositivo.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_documento_anotacoes_base
  ADD COLUMN IF NOT EXISTS tipo_grifo text,
  ADD COLUMN IF NOT EXISTS editorial  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS disp_id    text,
  ADD COLUMN IF NOT EXISTS offset_ini integer,
  ADD COLUMN IF NOT EXISTS offset_fim integer;

ALTER TABLE public.simulado_leitura_anotacoes
  ADD COLUMN IF NOT EXISTS disp_id    text,
  ADD COLUMN IF NOT EXISTS offset_ini integer,
  ADD COLUMN IF NOT EXISTS offset_fim integer;

NOTIFY pgrst, 'reload schema';
