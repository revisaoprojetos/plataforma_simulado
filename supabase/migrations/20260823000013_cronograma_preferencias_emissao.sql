-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — preferências de visualização da emissão
--
-- Renumerada de 20260823000004 para 20260823000013. A main trouxe 20260823000004_grifos.sql, e o Supabase
-- identifica a migração pelo PREFIXO numérico: dois arquivos com o mesmo número fazem um
-- dos dois ser considerado já aplicado e nunca rodar. O número novo mantém a ordem relativa
-- às demais migrações do cronograma.
--
-- Que semanas o aluno colapsou e se ele escolheu esconder a contagem de metas. É estado de
-- LEITURA, não de dado: não muda o cronograma, muda como aquele aluno olha para ele.
--
-- Vai numa coluna jsonb da própria emissão, e não em tabela separada, porque a emissão JÁ é
-- a linha daquele aluno naquele cronograma — a chave seria exatamente a mesma. Tabela nova
-- só acrescentaria um join a cada abertura de tela para guardar dois campos.
--
-- jsonb em vez de colunas: são preferências de tela, o conjunto vai mudar (ordenação,
-- visão padrão, densidade), e cada uma delas não merece uma migração.
--
-- Não vai para localStorage porque o aluno estuda no computador e no celular; colapsar 60
-- semanas no notebook e reabrir tudo no telefone é perder o trabalho.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_cronograma_emissoes
  ADD COLUMN IF NOT EXISTS preferencias jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.simulado_cronograma_emissoes.preferencias IS
  'Estado de leitura do ALUNO nesta emissão: { semanasColapsadas: int[], ocultarContagem: bool }. Não afeta a grade nem o PDF.';

NOTIFY pgrst, 'reload schema';
