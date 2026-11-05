-- Disciplinas SEM DUPLICATA no banco (correção do que a importação duplicou + trava p/ não voltar).
-- Pré-requisito: 20261105020000_unificar_disciplinas_todos_vinculos.sql aplicada (repontamento de TODOS os vínculos).
--
-- 1) simulado_norm_nome(): chave do nome (sem acento, minúscula, espaços colapsados) — IMMUTABLE p/ poder indexar.
-- 2) Corrige as duplicadas EXISTENTES: só as de MESMO nome normalizado no MESMO tenant (ex.: "Direito Tributário" × "direito  tributario").
--    NÃO mexe em nomes diferentes (ex.: "Direito Tributário - verificar" continua separada). Mantém a que tem mais vínculo
--    (classificação > ordem > pastas ligadas > mais antiga) e REPONTA tudo da(s) outra(s) p/ ela — pastas da Biblioteca,
--    cronogramas (metas/links/conjuntos), questões, assuntos, simulados e demais tabelas com `disciplina_id` — herdando
--    classificação/cor/ordem. Cada fusão fica no log de reversão (simulado_disciplina_unificacoes → "desfazer").
-- 3) Trava: índice único (tenant, nome normalizado) → o banco recusa uma nova duplicada, venha de onde vier.
--
-- ANTES de aplicar, para VER o que será corrigido (somente leitura):
--   select tenant_id, simulado_norm_nome(nome) chave, count(*) qtd, array_agg(nome order by created_at) nomes
--     from public.simulado_disciplinas group by 1,2 having count(*) > 1 order by qtd desc;
-- Idempotente. Aplicação manual no SQL Editor.

CREATE OR REPLACE FUNCTION public.simulado_norm_nome(p text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$
  -- NFD + remove marcas de acento (cobre "á" composto OU decomposto — textos copiados de planilha/Word variam), remove zero-width,
  -- minúscula e colapsa QUALQUER espaço (inclui NBSP e espaços Unicode, que parecem iguais ao olho).
  SELECT btrim(regexp_replace(
           lower(regexp_replace(normalize(coalesce(p, ''), NFD), '[\u0300-\u036f\u200b-\u200d\ufeff]', '', 'g')),
           '[\s\u00a0\u2000-\u200a\u202f\u205f\u3000]+', ' ', 'g'))
$$;

DO $$
DECLARE
  r record; v_canon uuid; v_dups uuid[]; v_n int := 0;
BEGIN
  FOR r IN
    SELECT tenant_id, public.simulado_norm_nome(nome) AS k
      FROM public.simulado_disciplinas
     WHERE public.simulado_norm_nome(nome) <> ''
     GROUP BY 1, 2 HAVING count(*) > 1
  LOOP
    SELECT d.id INTO v_canon
      FROM public.simulado_disciplinas d
     WHERE d.tenant_id = r.tenant_id AND public.simulado_norm_nome(d.nome) = r.k
     ORDER BY (d.classificacao IS NOT NULL) DESC,
              (d.ordem IS NOT NULL) DESC,
              (SELECT count(*) FROM public.simulado_pastas p WHERE p.disciplina_id = d.id) DESC,
              d.created_at ASC NULLS LAST, d.id ASC
     LIMIT 1;

    SELECT array_agg(d.id) INTO v_dups
      FROM public.simulado_disciplinas d
     WHERE d.tenant_id = r.tenant_id AND public.simulado_norm_nome(d.nome) = r.k AND d.id <> v_canon;

    PERFORM public.simulado_unificar_disciplinas(r.tenant_id, v_canon, v_dups, NULL);
    v_n := v_n + 1;
  END LOOP;
  RAISE NOTICE 'disciplinas duplicadas corrigidas: % grupo(s)', v_n;
END $$;

-- Trava no banco: uma disciplina por nome (normalizado) por tenant.
CREATE UNIQUE INDEX IF NOT EXISTS uq_simulado_disciplinas_tenant_nome_norm
  ON public.simulado_disciplinas (tenant_id, public.simulado_norm_nome(nome))
  WHERE public.simulado_norm_nome(nome) <> '';

NOTIFY pgrst, 'reload schema';
