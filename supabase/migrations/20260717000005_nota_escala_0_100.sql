-- Migra a ESCALA DA NOTA de 0–10 para 0–100 (percentual de acerto). Multiplica por 10 as
-- notas já gravadas para casar com o novo cálculo canônico (lib/simulado/nota.ts).
--
-- ⚠️ RODAR UMA ÚNICA VEZ, logo APÓS o deploy da imagem com o novo cálculo. NÃO rode duas vezes
--    (multiplicaria de novo). O filtro `<= 10` protege o caso comum (notas já migradas > 10
--    são ignoradas), mas não é 100% idempotente para notas baixas — execute só uma vez.

UPDATE public.simulado_sessoes_prova
   SET nota = ROUND((nota * 10)::numeric, 2)
 WHERE nota IS NOT NULL AND nota <= 10;

UPDATE public.simulado_recorrecao_impactos
   SET nota_antes  = ROUND((nota_antes  * 10)::numeric, 2),
       nota_depois = ROUND((nota_depois * 10)::numeric, 2),
       delta       = ROUND((delta       * 10)::numeric, 2)
 WHERE (nota_antes IS NOT NULL AND nota_antes <= 10)
    OR (nota_depois IS NOT NULL AND nota_depois <= 10);
