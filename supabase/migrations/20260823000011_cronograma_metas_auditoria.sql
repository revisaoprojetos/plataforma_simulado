-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — auditoria de metas: repetidas entre cronogramas e formato de aula
--
-- Renumerada de 20260823000002 para 20260823000011. A main trouxe 20260823000002_lei_versionamento.sql, e o Supabase
-- identifica a migração pelo PREFIXO numérico: dois arquivos com o mesmo número fazem um
-- dos dois ser considerado já aplicado e nunca rodar. O número novo mantém a ordem relativa
-- às demais migrações do cronograma.
--
-- Até aqui a equipe só via metas DENTRO de um cronograma. A pergunta que faltava é a
-- transversal: "esta meta está em quantos cronogramas?" e "a mesma aula está gravada como
-- '01' aqui e '1' ali?". Sem responder isso, corrigir uma grafia significa abrir 26 telas.
--
-- Tudo agregado aqui porque são 16.697 metas: agrupar na aplicação exigiria baixar as
-- 16.697 a cada abertura da tela — a armadilha do teto de 1.000 que este módulo já pagou
-- três vezes.
--
-- `simulado_cronograma_chave_aula` é a normalização que define "a mesma aula": '01' e '1'
-- viram '1'; '1.1' continua distinta. Fica como função para a leitura e a ESCRITA usarem
-- exatamente a mesma regra — se divergirem, a tela mostra um grupo que a correção não pega.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.simulado_cronograma_chave_aula(p_aula text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_aula IS NULL OR btrim(p_aula) = '' THEN ''
    WHEN btrim(p_aula) ~ '^\d+$' THEN (btrim(p_aula))::bigint::text
    ELSE lower(btrim(p_aula))
  END;
$$;

/* Normalização de texto para agrupar: sem acento, sem caixa, sem espaço repetido. */
CREATE OR REPLACE FUNCTION public.simulado_cronograma_normalizar(p_txt text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(btrim(regexp_replace(
    translate(coalesce(p_txt, ''),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'),
    '\s+', ' ', 'g')));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A MESMA AULA em formatos diferentes — o que quebra o casamento com os links (R11).
CREATE OR REPLACE FUNCTION public.simulado_cronograma_aulas_variantes(p_tenant uuid)
RETURNS TABLE (
  disciplina text, aula_chave text, total bigint,
  formas jsonb,       -- [{ aula, n }]
  cronogramas jsonb   -- [{ id, nome, aula, n }]
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT m.disciplina, public.simulado_cronograma_chave_aula(m.aula) AS ch,
           btrim(m.aula) AS forma, m.cronograma_id, c.nome AS cron_nome
    FROM public.simulado_cronograma_metas m
    JOIN public.simulado_cronogramas c ON c.id = m.cronograma_id AND c.deletado = false
    WHERE m.tenant_id = p_tenant AND coalesce(btrim(m.aula), '') <> ''
  ),
  -- Só as combinações em que a MESMA aula aparece escrita de mais de um jeito.
  alvo AS (
    SELECT disciplina, ch FROM base
    GROUP BY disciplina, ch HAVING count(DISTINCT forma) > 1
  ),
  por_forma AS (
    SELECT b.disciplina, b.ch, b.forma, count(*)::bigint n
    FROM base b JOIN alvo a ON a.disciplina = b.disciplina AND a.ch = b.ch
    GROUP BY b.disciplina, b.ch, b.forma
  ),
  por_cron AS (
    SELECT b.disciplina, b.ch, b.cronograma_id, b.cron_nome, b.forma, count(*)::bigint n
    FROM base b JOIN alvo a ON a.disciplina = b.disciplina AND a.ch = b.ch
    GROUP BY b.disciplina, b.ch, b.cronograma_id, b.cron_nome, b.forma
  )
  SELECT
    a.disciplina, a.ch,
    (SELECT sum(n) FROM por_forma f WHERE f.disciplina = a.disciplina AND f.ch = a.ch),
    (SELECT jsonb_agg(jsonb_build_object('aula', f.forma, 'n', f.n) ORDER BY f.n DESC)
       FROM por_forma f WHERE f.disciplina = a.disciplina AND f.ch = a.ch),
    (SELECT jsonb_agg(jsonb_build_object('id', p.cronograma_id, 'nome', p.cron_nome, 'aula', p.forma, 'n', p.n) ORDER BY p.cron_nome)
       FROM por_cron p WHERE p.disciplina = a.disciplina AND p.ch = a.ch)
  FROM alvo a
  ORDER BY a.disciplina, length(a.ch), a.ch;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. A MESMA META em vários cronogramas — a visão transversal que faltava.
--    `p_min_cron = 1` lista tudo; 2 ou mais, só o que se repete.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_metas_agrupadas(
  p_tenant uuid,
  p_busca text DEFAULT NULL,
  p_min_cron int DEFAULT 2,
  p_tipo text DEFAULT NULL,
  p_limite int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS TABLE (
  chave text, tipo text, disciplina text, aula_chave text, conteudo text,
  n_metas bigint, n_cronogramas bigint, n_formas_aula bigint,
  cronogramas jsonb,  -- [{ id, nome, semana, dia, aula, meta_id }]
  total_linhas bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT
      m.id, m.tipo, m.disciplina, m.conteudo, m.semana, m.dia, btrim(m.aula) AS forma,
      public.simulado_cronograma_chave_aula(m.aula) AS ch,
      m.cronograma_id, c.nome AS cron_nome,
      m.tipo || '|' || public.simulado_cronograma_normalizar(m.disciplina) || '|'
        || public.simulado_cronograma_chave_aula(m.aula) || '|'
        || public.simulado_cronograma_normalizar(m.conteudo) AS k
    FROM public.simulado_cronograma_metas m
    JOIN public.simulado_cronogramas c ON c.id = m.cronograma_id AND c.deletado = false
    WHERE m.tenant_id = p_tenant
      AND (p_tipo IS NULL OR m.tipo = p_tipo)
      AND (
        p_busca IS NULL OR p_busca = ''
        OR m.disciplina ILIKE '%' || p_busca || '%'
        OR coalesce(m.conteudo, '') ILIKE '%' || p_busca || '%'
        OR coalesce(m.aula, '') ILIKE '%' || p_busca || '%'
      )
  ),
  grupos AS (
    SELECT
      k,
      min(tipo) AS tipo, min(disciplina) AS disciplina, min(ch) AS ch,
      min(conteudo) AS conteudo,
      count(*)::bigint AS n_metas,
      count(DISTINCT cronograma_id)::bigint AS n_cron,
      count(DISTINCT forma)::bigint AS n_formas,
      jsonb_agg(jsonb_build_object(
        'id', cronograma_id, 'nome', cron_nome, 'semana', semana,
        'dia', dia, 'aula', forma, 'meta_id', id
      ) ORDER BY cron_nome, semana, dia) AS crons
    FROM base
    GROUP BY k
    HAVING count(DISTINCT cronograma_id) >= greatest(p_min_cron, 1)
  )
  SELECT g.k, g.tipo, g.disciplina, g.ch, g.conteudo,
         g.n_metas, g.n_cron, g.n_formas, g.crons,
         count(*) OVER ()::bigint
  FROM grupos g
  ORDER BY g.n_cron DESC, g.n_metas DESC, g.disciplina, g.ch
  LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. DURAÇÕES DIVERGENTES na mesma semana+tipo — no papel só a primeira é impressa,
--    então as outras desaparecem sem ninguém perceber.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_duracoes_divergentes(p_tenant uuid)
RETURNS TABLE (
  cronograma_id uuid, cronograma_nome text, semana int, tipo text,
  valores jsonb,  -- [{ duracao, n }]
  total bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH base AS (
    SELECT m.cronograma_id, c.nome, m.semana, m.tipo, btrim(m.duracao) AS dur, count(*)::bigint n
    FROM public.simulado_cronograma_metas m
    JOIN public.simulado_cronogramas c ON c.id = m.cronograma_id AND c.deletado = false
    WHERE m.tenant_id = p_tenant AND coalesce(btrim(m.duracao), '') <> ''
    GROUP BY m.cronograma_id, c.nome, m.semana, m.tipo, btrim(m.duracao)
  )
  SELECT cronograma_id, nome, semana, tipo,
         jsonb_agg(jsonb_build_object('duracao', dur, 'n', n) ORDER BY n DESC),
         sum(n)::bigint
  FROM base
  GROUP BY cronograma_id, nome, semana, tipo
  HAVING count(*) > 1
  ORDER BY nome, semana, tipo;
$$;

DO $$
DECLARE r text; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'simulado_cronograma_aulas_variantes(uuid)',
    'simulado_cronograma_metas_agrupadas(uuid,text,int,text,int,int)',
    'simulado_cronograma_duracoes_divergentes(uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM public;', f);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM %I;', f, r);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Sem isto, cada agrupamento varre as 16.697 metas.
CREATE INDEX IF NOT EXISTS idx_cron_metas_tenant_disc_aula
  ON public.simulado_cronograma_metas (tenant_id, disciplina, aula);

NOTIFY pgrst, 'reload schema';
