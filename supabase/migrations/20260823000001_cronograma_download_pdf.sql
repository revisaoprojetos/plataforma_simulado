-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — o registro de download aceita 'pdf'
--
-- A tabela nasceu com a lista do gerador legado ('docx','ficha','csv'). O PDF é a primeira
-- exportação que a plataforma entrega de fato, e sem isto o INSERT seria recusado por CHECK
-- — em silêncio, porque o registro de download é best-effort e não derruba o download.
--
-- Mesma armadilha que já custou as emissões (via_acesso='pacote' recusado por um CHECK
-- antigo): quando a lista de valores válidos mora no banco, mudar o código sem mudar o CHECK
-- não dá erro na tela, dá tabela vazia.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_cronograma_downloads
  DROP CONSTRAINT IF EXISTS simulado_cronograma_downloads_botao_check;

ALTER TABLE public.simulado_cronograma_downloads
  ADD CONSTRAINT simulado_cronograma_downloads_botao_check
  CHECK (botao IN ('pdf', 'docx', 'ficha', 'csv'));

COMMENT ON COLUMN public.simulado_cronograma_downloads.botao IS
  'Qual exportação o aluno pediu. Hoje só ''pdf'' é emitido; os outros ficam para quando DOCX/CSV saírem do papel.';

NOTIFY pgrst, 'reload schema';
