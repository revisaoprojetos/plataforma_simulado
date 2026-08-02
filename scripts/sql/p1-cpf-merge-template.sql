-- =====================================================================
-- P1 — CPFs duplicados (43 pares / 87 registros). REVISAR antes de rodar.
--
-- ⚠️ Contexto: NÃO é brecha de login. O acesso `email+CPF` casa por E-MAIL primeiro
--    (CPF é só 2º fator), e cada duplicata tem e-mail diferente — então cada aluno
--    entra pelo próprio e-mail. Isto é HIGIENE de dado, não urgência.
--
-- Muitos pares são o MESMO dono com 2 e-mails (ex.: typo joamoraesl14 vs joaomoraesl14);
-- alguns podem ser PESSOAS diferentes com CPF digitado errado. Por isso: decidir caso a caso.
-- =====================================================================

-- 1) RELATÓRIO (read-only) — cada lado do par com sua atividade. O de MAIS sessões
--    costuma ser o "principal" (KEEP); o outro vira DROP (a mesclar/soft-delete).
WITH dups AS (
  SELECT tenant_id, regexp_replace(cpf, '\D', '', 'g') AS cpf_n
    FROM public.simulado_estudantes
   WHERE cpf IS NOT NULL AND cpf <> '' AND deletado = false
   GROUP BY 1, 2 HAVING count(*) > 1
)
SELECT e.tenant_id, d.cpf_n AS cpf, e.id, e.email, e.nome, e.created_at,
       (SELECT count(*) FROM public.simulado_sessoes_prova s WHERE s.estudante_id = e.id AND s.deletado = false) AS sessoes,
       (SELECT count(*) FROM public.simulado_matriculas m WHERE m.estudante_id = e.id) AS matriculas
  FROM public.simulado_estudantes e
  JOIN dups d ON d.tenant_id = e.tenant_id AND regexp_replace(e.cpf, '\D', '', 'g') = d.cpf_n
 WHERE e.deletado = false
 ORDER BY d.cpf_n, sessoes DESC, matriculas DESC;


-- 2) MERGE de UM par — troque <KEEP> (mantido) e <DROP> (mesclado) pelos ids do relatório.
--    Rode par a par. Repointa histórico do DROP p/ o KEEP evitando violar os UNIQUE
--    (matrículas e avaliações), depois soft-delete no DROP. A pertença a grupos é reposta
--    sozinha pelo cron self-healing (não precisa mexer aqui).
/*
BEGIN;

-- sessões (sem unicidade por aluno+simulado): repoint direto.
UPDATE public.simulado_sessoes_prova SET estudante_id = '<KEEP>' WHERE estudante_id = '<DROP>';

-- matrículas (UNIQUE tenant+estudante+simulado): move só as que o KEEP ainda não tem; apaga o resto.
UPDATE public.simulado_matriculas m SET estudante_id = '<KEEP>'
 WHERE m.estudante_id = '<DROP>'
   AND NOT EXISTS (SELECT 1 FROM public.simulado_matriculas k
                    WHERE k.tenant_id = m.tenant_id AND k.estudante_id = '<KEEP>' AND k.simulado_id = m.simulado_id);
DELETE FROM public.simulado_matriculas WHERE estudante_id = '<DROP>';

-- avaliações NPS (UNIQUE estudante+simulado): idem.
UPDATE public.simulado_avaliacoes a SET estudante_id = '<KEEP>'
 WHERE a.estudante_id = '<DROP>'
   AND NOT EXISTS (SELECT 1 FROM public.simulado_avaliacoes k
                    WHERE k.estudante_id = '<KEEP>' AND k.simulado_id = a.simulado_id);
DELETE FROM public.simulado_avaliacoes WHERE estudante_id = '<DROP>';

-- soft-delete do duplicado (não some do histórico; só sai do login e das contagens).
UPDATE public.simulado_estudantes SET deletado = true WHERE id = '<DROP>';

COMMIT;
*/


-- 3) [OPCIONAL] Só DEPOIS de resolver TODOS os pares (relatório do passo 1 = 0):
--    impede novas duplicatas de CPF por tenant.
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_estudantes_cpf
--   ON public.simulado_estudantes (tenant_id, (regexp_replace(cpf, '\D', '', 'g')))
--   WHERE cpf IS NOT NULL AND cpf <> '' AND deletado = false;
