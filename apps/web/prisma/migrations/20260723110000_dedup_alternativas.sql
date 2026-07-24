-- Limpa alternativas DUPLICADAS (bug: a RLS impedia o DELETE no update da questão, então
-- cada save reinseria as alternativas SEM apagar as antigas → multiplicavam).
-- Passo 1: re-aponta as respostas dos duplicados para a alternativa "canônica" (menor ctid,
--          mesma questão+ordem+texto → idênticas, re-apontar é lossless).
-- Passo 2: apaga os duplicados (já sem referências de FK).
-- Rodar no SQL Editor do Supabase. Idempotente.

BEGIN;

WITH canonicas AS (
  SELECT DISTINCT ON (questao_id, ordem, texto)
         id AS keep_id, questao_id, ordem, texto
    FROM public.simulado_alternativas
   ORDER BY questao_id, ordem, texto, ctid
),
dups AS (
  SELECT a.id AS dup_id, c.keep_id
    FROM public.simulado_alternativas a
    JOIN canonicas c
      ON c.questao_id = a.questao_id
     AND c.ordem = a.ordem
     AND c.texto IS NOT DISTINCT FROM a.texto
   WHERE a.id <> c.keep_id
)
UPDATE public.simulado_respostas_objetivas r
   SET alternativa_id = d.keep_id
  FROM dups d
 WHERE r.alternativa_id = d.dup_id;

DELETE FROM public.simulado_alternativas a
 USING public.simulado_alternativas b
 WHERE a.ctid > b.ctid
   AND a.questao_id = b.questao_id
   AND a.ordem = b.ordem
   AND a.texto IS NOT DISTINCT FROM b.texto;

COMMIT;

-- Conferir: nenhuma questão deve ter alternativas repetidas por (ordem, texto).
-- SELECT questao_id, ordem, texto, count(*) FROM public.simulado_alternativas
--  GROUP BY questao_id, ordem, texto HAVING count(*) > 1;
