-- ═══════════════════════════════════════════════════════════════════════════
-- Etiquetas FUNCIONAIS: a etiqueta carrega um COMPORTAMENTO aplicado no simulado.
--
-- funcao:
--   NULL            → etiqueta comum (só rótulo/badge).
--   'anular'        → no simulado a questão fica BLOQUEADA + badge no topo + PONTO
--                     automático a todos (política pontua_todos). Ex.: Questão anulada,
--                     Questão desatualizada.
--   'avisar'        → só mostra um alerta no topo da questão; continua respondível e
--                     pontua normal. Ex.: Gabarito em revisão.
--   'desconsiderar' → a questão SAI da conta da prova (não pontua ninguém, sai do total)
--                     e fica bloqueada. Ex.: Questão desconsiderada.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_etiquetas
  ADD COLUMN IF NOT EXISTS funcao text;
