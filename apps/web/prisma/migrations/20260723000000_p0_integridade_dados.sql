-- =====================================================================
-- P0 — Correções de integridade de dados (auditoria 2026-07)
-- Rodar no SQL Editor do Supabase. Blocos SEGUROS podem rodar direto;
-- blocos [REVISAR] exigem conferência manual antes (mesclam/removem dados).
-- Idempotente onde possível.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) [SEGURO] Backfill de matriculas.status — ~94% estão NULL.
--    Evita que qualquer filtro futuro por status='ativa' descarte
--    matrículas válidas (e ~377 históricos de sessão). O código hoje
--    filtra por `liberado`, então isto é defensivo para o futuro.
-- ---------------------------------------------------------------------
UPDATE public.simulado_matriculas
   SET status = 'ativa'
 WHERE status IS NULL AND liberado = true;

-- ---------------------------------------------------------------------
-- 2) [SEGURO/ADITIVO] tenant_id em api_keys (isolamento multi-tenant).
--    Chaves antigas ficam com tenant_id NULL (somem da listagem por
--    tenant) — recrie-as se ainda estiverem em uso. O código já grava
--    tenant_id nas novas chaves e filtra a listagem/revogação por ele.
-- ---------------------------------------------------------------------
ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS tenant_id uuid;
CREATE INDEX IF NOT EXISTS idx_api_keys_tenant ON public.api_keys(tenant_id);

-- ---------------------------------------------------------------------
-- 3) [SEGURO] Matrículas órfãs (apontam para estudante já deletado) — ~32.
--    Removê-las tira lixo que infla contagens de "participantes".
-- ---------------------------------------------------------------------
DELETE FROM public.simulado_matriculas m
 USING public.simulado_estudantes e
 WHERE m.estudante_id = e.id
   AND e.deletado = true;

-- ---------------------------------------------------------------------
-- 4) [SEGURO] Matrículas duplicadas (mesmo tenant+estudante+simulado) — ~42.
--    Mantém a linha de menor ctid (a "primeira") e remove as demais.
-- ---------------------------------------------------------------------
DELETE FROM public.simulado_matriculas a
 USING public.simulado_matriculas b
 WHERE a.ctid > b.ctid
   AND a.tenant_id   = b.tenant_id
   AND a.estudante_id = b.estudante_id
   AND a.simulado_id  = b.simulado_id;

-- Constraint p/ não voltar a duplicar. ⚠️ Só habilite DEPOIS de trocar os
-- inserts de matrícula para upsert idempotente (senão o sync grupo→banco
-- passa a dar erro de violação). Deixe comentado por enquanto:
-- CREATE UNIQUE INDEX IF NOT EXISTS uq_matriculas_est_sim
--   ON public.simulado_matriculas (tenant_id, estudante_id, simulado_id);

-- ---------------------------------------------------------------------
-- 5) [REVISAR] CPFs duplicados em estudantes — ~43. NÃO auto-mesclar:
--    dá pra logar no perfil errado (login email_cpf) e duplicar na Guru.
--    Rode o SELECT, decida qual registro fica, migre sessões/matrículas
--    para ele e só então crie a constraint.
-- ---------------------------------------------------------------------
-- SELECT cpf, count(*) AS n, array_agg(id) AS ids, array_agg(email) AS emails
--   FROM public.simulado_estudantes
--  WHERE cpf IS NOT NULL AND deletado = false
--  GROUP BY cpf HAVING count(*) > 1
--  ORDER BY n DESC;
-- Depois de limpo:
-- CREATE UNIQUE INDEX uq_estudantes_cpf
--   ON public.simulado_estudantes (tenant_id, cpf)
--   WHERE cpf IS NOT NULL AND deletado = false;

-- ---------------------------------------------------------------------
-- 6) [REVISAR] Grupo "Passaporte": ~22 membros que NÃO são passaporte.
--    Decida remover do grupo OU reclassificar o aluno como passaporte.
--    (Troque <GID> pelo id do grupo Passaporte NÃO-mestre: 07fdf424-…)
-- ---------------------------------------------------------------------
-- SELECT gm.estudante_id, e.nome, e.email, e.classificacao
--   FROM public.simulado_grupo_membros gm
--   JOIN public.simulado_estudantes e ON e.id = gm.estudante_id
--  WHERE gm.grupo_id = '<GID>'
--    AND e.classificacao IS DISTINCT FROM 'passaporte';
-- Para remover os que não são passaporte do grupo:
-- DELETE FROM public.simulado_grupo_membros gm
--  USING public.simulado_estudantes e
--  WHERE gm.estudante_id = e.id
--    AND gm.grupo_id = '<GID>'
--    AND e.classificacao IS DISTINCT FROM 'passaporte';

-- (opcional) remover o grupo "Passaporte" MESTRE vazio, se confirmar 0 membros.
