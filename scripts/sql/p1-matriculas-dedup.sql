-- =====================================================================
-- P1 — Matrículas duplicadas (diagnóstico A3 retornou centenas). Causa: CORRIDA
-- entre o cron de sync (a cada 180s) e outras inserções. O código de sync já foi
-- ajustado para UPSERT ignorando duplicatas; falta (1) limpar o que já duplicou e
-- (2) criar o índice único que torna o upsert atômico à prova de corrida.
-- Rodar no SQL Editor do Supabase, nesta ordem.
-- =====================================================================

-- 1) [SEGURO] Remove duplicatas mantendo a linha de menor ctid (a "primeira").
DELETE FROM public.simulado_matriculas a
 USING public.simulado_matriculas b
 WHERE a.ctid > b.ctid
   AND a.tenant_id    = b.tenant_id
   AND a.estudante_id = b.estudante_id
   AND a.simulado_id  = b.simulado_id;

-- 2) Confirma que zerou (deve retornar 0 linhas).
SELECT tenant_id, estudante_id, simulado_id, count(*) AS n
  FROM public.simulado_matriculas
 GROUP BY tenant_id, estudante_id, simulado_id
HAVING count(*) > 1;

-- 3) [SEGURO após passo 1] Índice único — impede novas duplicatas e habilita o
--    upsert(onConflict) do sync. Rode SÓ com o passo 2 = 0.
CREATE UNIQUE INDEX IF NOT EXISTS uq_matriculas_est_sim
  ON public.simulado_matriculas (tenant_id, estudante_id, simulado_id);

-- Observação: com o índice criado, o sync (matricular-banco) passa a usar
-- upsert-ignore automaticamente (fallback para insert só enquanto o índice não existe).
-- Caminhos de inserção manual (admin → matrícula avulsa) passam a dar erro claro em
-- vez de duplicar silenciosamente — comportamento desejado.
