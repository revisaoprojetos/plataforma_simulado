-- Corrige simulado_prova_questoes.anulada nulo (dados migrados vieram sem o default).
-- Sintoma: o runner do aluno abre com "questoes: []" (a API filtra anulada = false,
-- e null != false no SQL) -> a prova não carrega / a tela quebra.
-- Solução: DEFAULT false + backfill dos nulos (aditivo, seguro).

ALTER TABLE public.simulado_prova_questoes
  ALTER COLUMN anulada SET DEFAULT false;

UPDATE public.simulado_prova_questoes
  SET anulada = false
  WHERE anulada IS NULL;
