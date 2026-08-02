-- =====================================================================
-- P0 — Banco de dados (revisão 2026-08). Rodar no SQL Editor do Supabase.
-- Ordem sugerida: A (diagnóstico, read-only) → B (VALIDATE FKs, seguro) →
-- C/D (só depois de revisar o diagnóstico).
-- Cada bloco é idempotente/guardado. Leia os comentários antes de rodar.
-- =====================================================================


-- =====================================================================
-- A) DIAGNÓSTICO (read-only) — rode primeiro e confira os resultados.
-- =====================================================================

-- A1. Órfãos que impediriam VALIDATE das FKs (deve retornar 0 em todas).
--     Se alguma linha > 0, resolva antes de validar aquela FK (bloco B).
SELECT 'fk_pq_questao' AS fk, count(*) AS orfaos
  FROM public.simulado_prova_questoes c
  LEFT JOIN public.simulado_questoes p ON p.id = c.questao_id
 WHERE c.questao_id IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'fk_pq_simulado', count(*)
  FROM public.simulado_prova_questoes c
  LEFT JOIN public.simulado_simulados p ON p.id = c.simulado_id
 WHERE c.simulado_id IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'fk_resp_questao', count(*)
  FROM public.simulado_respostas_objetivas c
  LEFT JOIN public.simulado_questoes p ON p.id = c.questao_id
 WHERE c.questao_id IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'fk_resp_sessao', count(*)
  FROM public.simulado_respostas_objetivas c
  LEFT JOIN public.simulado_sessoes_prova p ON p.id = c.sessao_id
 WHERE c.sessao_id IS NOT NULL AND p.id IS NULL
UNION ALL
SELECT 'fk_alt_questao', count(*)
  FROM public.simulado_alternativas c
  LEFT JOIN public.simulado_questoes p ON p.id = c.questao_id
 WHERE c.questao_id IS NOT NULL AND p.id IS NULL;

-- A2. CPFs duplicados (login email+CPF pode cair no cadastro errado).
SELECT cpf, count(*) AS n, array_agg(id) AS ids, array_agg(email) AS emails
  FROM public.simulado_estudantes
 WHERE cpf IS NOT NULL AND cpf <> '' AND deletado = false
 GROUP BY cpf HAVING count(*) > 1
 ORDER BY n DESC;

-- A3. Matrículas duplicadas restantes (deve ser 0 se o p0 anterior rodou).
SELECT tenant_id, estudante_id, simulado_id, count(*) AS n
  FROM public.simulado_matriculas
 GROUP BY tenant_id, estudante_id, simulado_id
HAVING count(*) > 1
 ORDER BY n DESC;


-- =====================================================================
-- B) [SEGURO] VALIDATE das 12 FKs criadas NOT VALID (integridade garantida
--    também para linhas existentes). Só validam se A1 = 0 órfãos.
--    VALIDATE pega lock leve (ShareUpdateExclusive): não bloqueia leitura;
--    ainda assim, prefira janela de baixo tráfego. O bloco pula a FK que
--    falhar (ex.: órfão) sem abortar as demais — veja os NOTICE.
-- =====================================================================
DO $$
DECLARE
  fks text[][] := ARRAY[
    ['simulado_questoes','fk_q_disciplina'],
    ['simulado_questoes','fk_q_banca'],
    ['simulado_questoes','fk_q_assunto'],
    ['simulado_questoes','fk_q_orgao'],
    ['simulado_alternativas','fk_alt_questao'],
    ['simulado_sessoes_prova','fk_sess_simulado'],
    ['simulado_sessoes_prova','fk_sess_estudante'],
    ['simulado_respostas_objetivas','fk_resp_questao'],
    ['simulado_respostas_objetivas','fk_resp_sessao'],
    ['simulado_respostas_objetivas','fk_resp_alt'],
    ['simulado_prova_questoes','fk_pq_questao'],
    ['simulado_prova_questoes','fk_pq_simulado']
  ];
  f text[];
BEGIN
  FOREACH f SLICE 1 IN ARRAY fks LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', f[1], f[2]);
      RAISE NOTICE 'validada: %', f[2];
    EXCEPTION
      WHEN undefined_object THEN RAISE NOTICE 'constraint ausente, pulei: %', f[2];
      WHEN others THEN RAISE NOTICE 'FALHOU % -> % (provável órfão; ver A1)', f[2], SQLERRM;
    END;
  END LOOP;
END $$;


-- =====================================================================
-- C) [REVISAR] CPFs duplicados → constraint única. NÃO auto-mesclar.
--    Depois de resolver os duplicados do A2 (escolher o registro que fica,
--    migrar sessões/matrículas do outro), habilite a constraint:
-- =====================================================================
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_estudantes_cpf
--   ON public.simulado_estudantes (tenant_id, cpf)
--   WHERE cpf IS NOT NULL AND cpf <> '' AND deletado = false;


-- =====================================================================
-- D) [REVISAR — depende de código] UNIQUE de matrículas.
--    ⚠️ Só habilite DEPOIS que os inserts de matrícula virarem upsert
--    idempotente (senão o sync grupo→banco quebra com violação de unicidade).
--    Com A3 = 0, o índice cria sem erro:
-- =====================================================================
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_matriculas_est_sim
--   ON public.simulado_matriculas (tenant_id, estudante_id, simulado_id);


-- =====================================================================
-- NOTA sobre RLS (isolamento cross-tenant):
--   Tabelas service-role (simulado_notificacoes, simulado_lgpd_solicitacoes,
--   simulado_pdf_jobs, simulado_compartilhamentos, integrações) estão com
--   RLS HABILITADO e SEM policy → já NEGAM acesso a anon/authenticated
--   (só o service role entra). O app usa service role (createAdminClient) e
--   filtra por tenant_id no código.
--   ⚠️ Importante: policy de RLS NÃO protege contra o service role (ele
--   sempre bypassa RLS). Ou seja, adicionar policy aqui NÃO fecha o risco
--   real (bug de filtro .eq('tenant_id') no app vazando via service role) —
--   e ainda AFROUXA o acesso (passaria a permitir authenticated).
--   Portanto: NÃO adicionar policies aqui. O hardening real é migrar essas
--   leituras para cliente autenticado + RLS (refactor maior, à parte) ou
--   garantir/testar os filtros de tenant no código.
-- =====================================================================
