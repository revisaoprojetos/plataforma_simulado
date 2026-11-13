-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA ADAPTATIVO — registro de gerações, eventos de meta e agregado diário para a aba admin "Análise de uso"
--
--  (a) simulado_cronograma_adaptativo_geracao_log  — 1 linha por gerar/recalcular/migrar/sync/fixar/arquivar/apagar/pausar (ok/erro/ms/motor/catálogo/hash dos params)
--  (b) simulado_cronograma_adaptativo_meta_evento  — marcar / desmarcar meta (de → para), com data/hora
--  (c) simulado_cronograma_adaptativo_agg_dia      — agregado por dia previsto × turma × disciplina × tipo (+ RPC de refresh idempotente)
--  (d) índices novos em plano_meta e meta
--  (e) RPCs paginadas de consulta (simulado_cronograma_adaptativo_an_*) — SECURITY DEFINER, só service_role
--
-- Aditiva e idempotente. O app é tolerante: sem esta migração a gravação do log é ignorada e a aba mostra
-- "histórico começa quando a migração for aplicada". Pré-requisitos já aplicados: 20261105050000/060000, 20261106040000, 20261110020000.
-- Aplicação manual no SQL Editor. Depois: rodar o refresh inicial (o cron /api/cron/adaptativo-agg?dias=120 faz isso).
-- ═══════════════════════════════════════════════════════════════════════════

-- colunas que as consultas usam (no-op quando já existem)
ALTER TABLE public.simulado_cronograma_adaptativo_meta  ADD COLUMN IF NOT EXISTS concluido_em date;
ALTER TABLE public.simulado_cronograma_adaptativo_meta  ADD COLUMN IF NOT EXISTS arquivada boolean NOT NULL DEFAULT false;
ALTER TABLE public.simulado_cronograma_adaptativo_plano ADD COLUMN IF NOT EXISTS fixado boolean NOT NULL DEFAULT false;

-- ── (a) log de gerações ─────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_geracao_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  plano_id      uuid,                                  -- sem FK: o log sobrevive ao "apagar" do plano
  acao          text NOT NULL CHECK (acao IN ('gerar','recalcular','migrar','sync','fixar','arquivar','apagar','pausar')),
  origem        text NOT NULL DEFAULT 'aluno' CHECK (origem IN ('aluno','equipe','migracao','iframe')),
  ator_user_id  uuid,
  motor         text,
  catalogo      text,
  params_hash   text,                                  -- hash curto de tema.cronograma_adaptativo_cfg vigente
  ok            boolean NOT NULL DEFAULT true,
  erro          text,
  ms            integer,
  n_metas       integer,
  fim           integer,                               -- semana final do plano gerado
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_glog_tenant_em ON public.simulado_cronograma_adaptativo_geracao_log (tenant_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_glog_aluno     ON public.simulado_cronograma_adaptativo_geracao_log (tenant_id, estudante_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_glog_acao      ON public.simulado_cronograma_adaptativo_geracao_log (tenant_id, acao, ok, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_glog_plano     ON public.simulado_cronograma_adaptativo_geracao_log (plano_id) WHERE plano_id IS NOT NULL;

-- ── (b) eventos de meta (marcar / desmarcar) ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_meta_evento (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  plano_id      uuid,                                  -- sem FK (sobrevive ao apagar plano)
  estudante_id  uuid NOT NULL,
  meta_id       text NOT NULL,
  de            text,                                  -- estado anterior: done | missed | NULL
  para          text,                                  -- novo estado:     done | missed | NULL (desmarcou)
  em            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_mev_tenant_em ON public.simulado_cronograma_adaptativo_meta_evento (tenant_id, em DESC);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_mev_plano     ON public.simulado_cronograma_adaptativo_meta_evento (plano_id, meta_id, em DESC);

-- ── (c) agregado diário ─────────────────────────────────────────────────────────────────────────
-- 1 linha por (dia previsto, turma, disciplina, tipo). grupo_id NULL = todos os alunos; disciplina NULL = sem disciplina.
-- Somar sempre dentro de UM recorte de grupo (grupo_id IS NULL para o total, ou um grupo_id), nunca misturar.
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_agg_dia (
  tenant_id       uuid NOT NULL,
  dia             date NOT NULL,
  grupo_id        uuid,
  disciplina      text,
  tipo            text NOT NULL,
  planejadas      integer NOT NULL DEFAULT 0,
  feitas          integer NOT NULL DEFAULT 0,
  nao_realizadas  integer NOT NULL DEFAULT 0,          -- marcadas pelo aluno como "não realizada"
  atrasadas       integer NOT NULL DEFAULT 0,          -- dia já passou e a meta segue SEM marcação (nem feita, nem não realizada)
  tempo_plan_seg  bigint  NOT NULL DEFAULT 0,
  tempo_real_seg  bigint  NOT NULL DEFAULT 0,
  res             bigint  NOT NULL DEFAULT 0,
  err             bigint  NOT NULL DEFAULT 0,
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cron_adapt_agg_dia
  ON public.simulado_cronograma_adaptativo_agg_dia (tenant_id, dia, COALESCE(grupo_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(disciplina, ''), tipo);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_agg_dia_grupo ON public.simulado_cronograma_adaptativo_agg_dia (tenant_id, grupo_id, dia);

-- ── (d) índices novos ───────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_aluno_data ON public.simulado_cronograma_adaptativo_plano_meta (tenant_id, estudante_id, data_prevista);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_tenant_data ON public.simulado_cronograma_adaptativo_plano_meta (tenant_id, data_prevista);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_meta_concl ON public.simulado_cronograma_adaptativo_meta (tenant_id, concluido_em) WHERE concluido_em IS NOT NULL;

-- ── RLS (padrão recente: app.current_tenant_id) + sem acesso público ────────────────────────────
DO $$
DECLARE t text; r text;
BEGIN
  FOREACH t IN ARRAY ARRAY['geracao_log','meta_evento','agg_dia'] LOOP
    EXECUTE format('ALTER TABLE public.simulado_cronograma_adaptativo_%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.simulado_cronograma_adaptativo_%I', t);
    EXECUTE format($p$CREATE POLICY tenant_isolation ON public.simulado_cronograma_adaptativo_%I
      USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true)::uuid)$p$, t);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
        EXECUTE format('REVOKE ALL ON public.simulado_cronograma_adaptativo_%I FROM %I', t, r);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT ALL ON public.simulado_cronograma_adaptativo_%I TO service_role', t);
    END IF;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- REFRESH do agregado diário (idempotente: apaga a janela [p_de, p_ate] do tenant e recalcula)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_agg_refresh(p_tenant uuid, p_de date, p_ate date)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  n integer := 0;
  v_ate date := p_ate;
  hoje date := (now() AT TIME ZONE 'America/Fortaleza')::date;
BEGIN
  IF p_tenant IS NULL OR p_de IS NULL OR v_ate IS NULL OR v_ate < p_de THEN RETURN 0; END IF;
  IF v_ate - p_de > 400 THEN v_ate := p_de + 400; END IF;          -- janela limitada (bounded)

  PERFORM pg_advisory_xact_lock(hashtextextended('adapt_agg:' || p_tenant::text, 0));   -- refreshes do mesmo tenant não se atropelam
  DELETE FROM public.simulado_cronograma_adaptativo_agg_dia WHERE tenant_id = p_tenant AND dia BETWEEN p_de AND v_ate;

  INSERT INTO public.simulado_cronograma_adaptativo_agg_dia
    (tenant_id, dia, grupo_id, disciplina, tipo, planejadas, feitas, nao_realizadas, atrasadas, tempo_plan_seg, tempo_real_seg, res, err, atualizado_em)
  WITH base AS (
    SELECT pm.estudante_id, pm.data_prevista AS dia, NULLIF(btrim(pm.disciplina), '') AS disciplina, pm.tipo,
           round(COALESCE(pm.horas, 0) * 3600)::bigint AS plan_seg, m.estado,
           COALESCE(m.tempo_seg, 0)::bigint AS tempo, COALESCE(m.res, 0)::bigint AS res, COALESCE(m.err, 0)::bigint AS err
      FROM public.simulado_cronograma_adaptativo_plano_meta pm
      JOIN public.simulado_cronograma_adaptativo_plano pl ON pl.id = pm.plano_id AND pl.arquivada = false AND pl.exemplo = false
      LEFT JOIN public.simulado_cronograma_adaptativo_meta m ON m.plano_id = pm.plano_id AND m.meta_id = pm.meta_id AND m.arquivada = false
     WHERE pm.tenant_id = p_tenant AND pm.data_prevista BETWEEN p_de AND v_ate
  ), expandida AS (
    SELECT b.*, NULL::uuid AS grupo_id FROM base b
    UNION ALL
    SELECT b.*, gm.grupo_id FROM base b
      JOIN public.simulado_grupo_membros gm ON gm.tenant_id = p_tenant AND gm.estudante_id = b.estudante_id
  )
  SELECT p_tenant, e.dia, e.grupo_id, e.disciplina, e.tipo,
         count(*)::int,
         (count(*) FILTER (WHERE e.estado = 'done'))::int,
         (count(*) FILTER (WHERE e.estado = 'missed'))::int,
         (count(*) FILTER (WHERE e.dia < hoje AND e.estado IS NULL))::int,
         sum(e.plan_seg)::bigint, sum(e.tempo)::bigint, sum(e.res)::bigint, sum(e.err)::bigint, now()
    FROM expandida e
   GROUP BY e.dia, e.grupo_id, e.disciplina, e.tipo;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- todos os tenants com plano (o cron chama esta; janela default curta)
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_agg_refresh_todos(p_de date, p_ate date, p_tenant uuid DEFAULT NULL)
RETURNS TABLE (tenant_id uuid, linhas integer) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t uuid;
BEGIN
  FOR t IN SELECT DISTINCT pl.tenant_id FROM public.simulado_cronograma_adaptativo_plano pl WHERE pl.exemplo = false AND (p_tenant IS NULL OR pl.tenant_id = p_tenant) LOOP
    tenant_id := t;
    linhas := public.simulado_cronograma_adaptativo_agg_refresh(t, p_de, p_ate);
    RETURN NEXT;
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- CONSULTAS PAGINADAS. Assinatura uniforme (o app chama todas igual):
--   (p_tenant, p_de, p_ate, p_grupo, p_disciplina, p_tipo, p_motor, p_busca, p_ordem, p_dir, p_limite, p_offset, p_param)
--   p_param = parâmetro específico da visão (dimensão/visão/dias parado). total_linhas = count(*) OVER ().
-- Filtro "aluno ∈ turma": simulado_grupo_membros. Planos considerados: arquivada=false e exemplo=false.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Geração: por dia ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_ger_dia(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (dia date, gerados bigint, recalculados bigint, migrados bigint, sincs bigint, outras bigint, falhas bigint, ms_medio numeric, metas_medio numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH l AS (
    SELECT (g.criado_em AT TIME ZONE 'America/Fortaleza')::date AS d, g.acao, g.ok, g.ms, g.n_metas
      FROM public.simulado_cronograma_adaptativo_geracao_log g
     WHERE g.tenant_id = p_tenant
       AND (p_de IS NULL OR g.criado_em >= (p_de::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_ate IS NULL OR g.criado_em < ((p_ate + 1)::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_motor IS NULL OR g.motor = p_motor)
       AND (p_grupo IS NULL OR g.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
  ), a AS (
    SELECT d AS dia,
           count(*) FILTER (WHERE acao = 'gerar' AND ok) AS gerados,
           count(*) FILTER (WHERE acao = 'recalcular' AND ok) AS recalculados,
           count(*) FILTER (WHERE acao = 'migrar' AND ok) AS migrados,
           count(*) FILTER (WHERE acao = 'sync' AND ok) AS sincs,
           count(*) FILTER (WHERE acao NOT IN ('gerar','recalcular','migrar','sync') AND ok) AS outras,
           count(*) FILTER (WHERE NOT ok) AS falhas,
           round(avg(ms) FILTER (WHERE acao IN ('gerar','recalcular','migrar') AND ok), 0) AS ms_medio,
           round(avg(n_metas) FILTER (WHERE acao IN ('gerar','recalcular','migrar') AND ok), 0) AS metas_medio
      FROM l GROUP BY d
  )
  SELECT a.dia, a.gerados, a.recalculados, a.migrados, a.sincs, a.outras, a.falhas, a.ms_medio, a.metas_medio, count(*) OVER ()::bigint
    FROM a
   ORDER BY (CASE p_ordem WHEN 'dia' THEN extract(epoch FROM a.dia::timestamp)::numeric WHEN 'gerados' THEN a.gerados WHEN 'recalculados' THEN a.recalculados
                          WHEN 'falhas' THEN a.falhas WHEN 'ms_medio' THEN a.ms_medio WHEN 'metas_medio' THEN a.metas_medio END)
            * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            a.dia DESC
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Geração: falhas e causas ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_ger_falhas(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (causa text, acao text, n bigint, alunos bigint, ultima timestamptz, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (
    SELECT COALESCE(NULLIF(left(btrim(g.erro), 140), ''), 'Sem motivo registrado') AS causa, g.acao,
           count(*) AS n, count(DISTINCT g.estudante_id) AS alunos, max(g.criado_em) AS ultima
      FROM public.simulado_cronograma_adaptativo_geracao_log g
     WHERE g.tenant_id = p_tenant AND g.ok = false
       AND (p_de IS NULL OR g.criado_em >= (p_de::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_ate IS NULL OR g.criado_em < ((p_ate + 1)::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_motor IS NULL OR g.motor = p_motor)
       AND (p_grupo IS NULL OR g.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
       AND (p_busca IS NULL OR p_busca = '' OR g.erro ILIKE '%' || p_busca || '%' OR g.acao ILIKE '%' || p_busca || '%')
     GROUP BY 1, 2
  )
  SELECT a.causa, a.acao, a.n, a.alunos, a.ultima, count(*) OVER ()::bigint
    FROM a
   ORDER BY (CASE p_ordem WHEN 'n' THEN a.n WHEN 'alunos' THEN a.alunos WHEN 'ultima' THEN extract(epoch FROM a.ultima)::numeric END)
            * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            (CASE WHEN p_ordem = 'causa' AND p_dir = 'asc' THEN a.causa END) ASC,
            (CASE WHEN p_ordem = 'causa' AND p_dir <> 'asc' THEN a.causa END) DESC,
            a.n DESC, a.causa
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Geração: quem mais regenera ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_ger_alunos(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (estudante_id uuid, nome text, email text, regeracoes bigint, geracoes bigint, falhas bigint, ultima timestamptz, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (
    SELECT g.estudante_id,
           count(*) FILTER (WHERE g.acao = 'recalcular' AND g.ok) AS regeracoes,
           count(*) FILTER (WHERE g.acao IN ('gerar','recalcular') AND g.ok) AS geracoes,
           count(*) FILTER (WHERE NOT g.ok) AS falhas,
           max(g.criado_em) AS ultima
      FROM public.simulado_cronograma_adaptativo_geracao_log g
     WHERE g.tenant_id = p_tenant
       AND (p_de IS NULL OR g.criado_em >= (p_de::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_ate IS NULL OR g.criado_em < ((p_ate + 1)::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_motor IS NULL OR g.motor = p_motor)
       AND (p_grupo IS NULL OR g.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
     GROUP BY g.estudante_id
  )
  SELECT a.estudante_id, es.nome, es.email, a.regeracoes, a.geracoes, a.falhas, a.ultima, count(*) OVER ()::bigint
    FROM a JOIN public.simulado_estudantes es ON es.id = a.estudante_id
   WHERE (p_busca IS NULL OR p_busca = '' OR es.nome ILIKE '%' || p_busca || '%' OR COALESCE(es.email, '') ILIKE '%' || p_busca || '%')
   ORDER BY (CASE p_ordem WHEN 'regeracoes' THEN a.regeracoes WHEN 'geracoes' THEN a.geracoes WHEN 'falhas' THEN a.falhas WHEN 'ultima' THEN extract(epoch FROM a.ultima)::numeric END)
            * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            (CASE WHEN p_ordem = 'nome' AND p_dir = 'asc' THEN es.nome END) ASC,
            (CASE WHEN p_ordem = 'nome' AND p_dir <> 'asc' THEN es.nome END) DESC,
            a.regeracoes DESC, es.nome, a.estudante_id
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Geração: por versão do motor / catálogo ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_ger_versoes(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (motor text, catalogo text, planos_atuais bigint, geracoes bigint, falhas bigint, ms_medio numeric, metas_medio numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pl AS (
    SELECT COALESCE(p.motor, p.cfg->>'motor', '—') AS motor, COALESCE(p.catalogo, p.cfg->>'catalogo', '—') AS catalogo, count(*) AS planos_atuais
      FROM public.simulado_cronograma_adaptativo_plano p
     WHERE p.tenant_id = p_tenant AND p.arquivada = false AND p.exemplo = false
       AND (p_grupo IS NULL OR p.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
     GROUP BY 1, 2
  ), lg AS (
    SELECT COALESCE(g.motor, '—') AS motor, COALESCE(g.catalogo, '—') AS catalogo,
           count(*) FILTER (WHERE g.acao IN ('gerar','recalcular','migrar') AND g.ok) AS geracoes,
           count(*) FILTER (WHERE NOT g.ok) AS falhas,
           round(avg(g.ms) FILTER (WHERE g.acao IN ('gerar','recalcular','migrar') AND g.ok), 0) AS ms_medio,
           round(avg(g.n_metas) FILTER (WHERE g.acao IN ('gerar','recalcular','migrar') AND g.ok), 0) AS metas_medio
      FROM public.simulado_cronograma_adaptativo_geracao_log g
     WHERE g.tenant_id = p_tenant
       AND (p_de IS NULL OR g.criado_em >= (p_de::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_ate IS NULL OR g.criado_em < ((p_ate + 1)::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_grupo IS NULL OR g.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
     GROUP BY 1, 2
  ), j AS (
    SELECT COALESCE(pl.motor, lg.motor) AS motor, COALESCE(pl.catalogo, lg.catalogo) AS catalogo, COALESCE(pl.planos_atuais, 0) AS planos_atuais,
           COALESCE(lg.geracoes, 0) AS geracoes, COALESCE(lg.falhas, 0) AS falhas, lg.ms_medio, lg.metas_medio
      FROM pl FULL JOIN lg ON lg.motor = pl.motor AND lg.catalogo = pl.catalogo
  )
  SELECT j.motor, j.catalogo, j.planos_atuais, j.geracoes, j.falhas, j.ms_medio, j.metas_medio, count(*) OVER ()::bigint
    FROM j
   WHERE (p_motor IS NULL OR j.motor = p_motor)
     AND (p_busca IS NULL OR p_busca = '' OR j.motor ILIKE '%' || p_busca || '%' OR j.catalogo ILIKE '%' || p_busca || '%')
   ORDER BY (CASE p_ordem WHEN 'planos_atuais' THEN j.planos_atuais WHEN 'geracoes' THEN j.geracoes WHEN 'falhas' THEN j.falhas WHEN 'ms_medio' THEN j.ms_medio END)
            * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            (CASE WHEN p_ordem = 'motor' AND p_dir = 'asc' THEN j.motor END) ASC,
            (CASE WHEN p_ordem = 'motor' AND p_dir <> 'asc' THEN j.motor END) DESC,
            j.planos_atuais DESC, j.motor DESC, j.catalogo
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Configuração dos alunos (p_param = dimensão) ────────────────────────────────────────────────
-- dimensões: horas_dia | vel | revisao | arranjo | recesso | pausa | metas | materias
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_config(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (valor text, n bigint, pct numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pl AS (
    SELECT p.*, (SELECT COALESCE(sum(h.horas), 0) / 7.0 FROM public.simulado_cronograma_adaptativo_plano_horas h WHERE h.plano_id = p.id) AS horas_dia_media,
           EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_recesso r WHERE r.plano_id = p.id) AS tem_recesso
      FROM public.simulado_cronograma_adaptativo_plano p
     WHERE p.tenant_id = p_tenant AND p.arquivada = false AND p.exemplo = false
       AND (p_motor IS NULL OR COALESCE(p.motor, p.cfg->>'motor') = p_motor)
       AND (p_grupo IS NULL OR p.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
  ), tot AS (SELECT count(*)::numeric AS t FROM pl),
  v AS (
    SELECT CASE WHEN horas_dia_media < 1 THEN 'Menos de 1 h/dia' WHEN horas_dia_media < 2 THEN '1 a 2 h/dia' WHEN horas_dia_media < 3 THEN '2 a 3 h/dia'
                WHEN horas_dia_media < 4 THEN '3 a 4 h/dia' WHEN horas_dia_media < 6 THEN '4 a 6 h/dia' ELSE '6 h/dia ou mais' END AS valor
      FROM pl WHERE p_param = 'horas_dia'
    UNION ALL SELECT COALESCE(round(vel, 1)::text, 'Sem dado') FROM pl WHERE p_param = 'vel'
    UNION ALL SELECT CASE WHEN rev_ativa IS NULL THEN 'Sem dado' WHEN rev_ativa THEN 'Revisão ligada' || COALESCE(' · a cada ' || rev_cada || ' sem.', '') ELSE 'Revisão desligada' END FROM pl WHERE p_param = 'revisao'
    UNION ALL SELECT COALESCE(NULLIF(arranjo, ''), 'Sem dado') FROM pl WHERE p_param = 'arranjo'
    UNION ALL SELECT CASE WHEN tem_recesso THEN 'Com recesso cadastrado' ELSE 'Sem recesso' END FROM pl WHERE p_param = 'recesso'
    UNION ALL SELECT CASE WHEN pausa_desde IS NOT NULL OR pausa IS NOT NULL THEN 'Pausado' ELSE 'Em andamento' END FROM pl WHERE p_param = 'pausa'
    UNION ALL SELECT x.nome FROM pl, LATERAL (VALUES ('PDFull', metas_pf), ('PDFlash', metas_fl), ('Questões', metas_qu), ('LegProc', metas_lp), ('Vídeo', metas_vd)) AS x(nome, ligado)
                WHERE p_param = 'metas' AND x.ligado IS TRUE
    UNION ALL SELECT d.disciplina FROM pl JOIN public.simulado_cronograma_adaptativo_plano_disciplina d ON d.plano_id = pl.id WHERE p_param = 'materias'
  ), a AS (
    SELECT v.valor, count(*) AS n, round(100.0 * count(*) / NULLIF((SELECT t FROM tot), 0), 1) AS pct FROM v GROUP BY v.valor
  )
  SELECT a.valor, a.n, a.pct, count(*) OVER ()::bigint
    FROM a
   WHERE (p_busca IS NULL OR p_busca = '' OR a.valor ILIKE '%' || p_busca || '%')
   ORDER BY (CASE p_ordem WHEN 'n' THEN a.n WHEN 'pct' THEN a.pct END) * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            (CASE WHEN p_ordem = 'valor' AND p_dir = 'asc' THEN a.valor END) ASC,
            (CASE WHEN p_ordem = 'valor' AND p_dir <> 'asc' THEN a.valor END) DESC,
            a.n DESC, a.valor
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Progresso (lê o agregado diário). p_param = visão: turma | materia | tipo | semana ──────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_prog(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (chave text, rotulo text, planejadas bigint, feitas bigint, nao_realizadas bigint, atrasadas bigint, pct_feitas numeric, tempo_plan_seg bigint, tempo_real_seg bigint, res bigint, err bigint, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH f AS (
    SELECT a.*, CASE COALESCE(p_param, 'materia')
                  WHEN 'turma' THEN a.grupo_id::text
                  WHEN 'tipo' THEN a.tipo
                  WHEN 'semana' THEN date_trunc('week', a.dia::timestamp)::date::text
                  ELSE COALESCE(a.disciplina, '') END AS ch
      FROM public.simulado_cronograma_adaptativo_agg_dia a
     WHERE a.tenant_id = p_tenant
       AND (p_de IS NULL OR a.dia >= p_de) AND (p_ate IS NULL OR a.dia <= p_ate)
       AND (p_disciplina IS NULL OR COALESCE(a.disciplina, '') = p_disciplina)
       AND (p_tipo IS NULL OR a.tipo = p_tipo)
       AND (CASE WHEN p_param = 'turma' THEN a.grupo_id IS NOT NULL AND (p_grupo IS NULL OR a.grupo_id = p_grupo)
                 ELSE a.grupo_id IS NOT DISTINCT FROM p_grupo END)
  ), g AS (
    SELECT f.ch AS chave, sum(f.planejadas)::bigint AS planejadas, sum(f.feitas)::bigint AS feitas, sum(f.nao_realizadas)::bigint AS nao_realizadas,
           sum(f.atrasadas)::bigint AS atrasadas, sum(f.tempo_plan_seg)::bigint AS tempo_plan_seg, sum(f.tempo_real_seg)::bigint AS tempo_real_seg,
           sum(f.res)::bigint AS res, sum(f.err)::bigint AS err
      FROM f GROUP BY f.ch
  ), r AS (
    SELECT g.chave,
           CASE COALESCE(p_param, 'materia')
             WHEN 'turma' THEN COALESCE((SELECT gr.nome FROM public.simulado_grupos gr WHERE gr.id::text = g.chave), 'Turma removida')
             WHEN 'tipo' THEN CASE g.chave WHEN 'pf' THEN 'PDFull' WHEN 'pp' THEN 'PDFull (parte)' WHEN 'fl' THEN 'PDFlash' WHEN 'qu' THEN 'Questões'
                                           WHEN 'lp' THEN 'LegProc' WHEN 'rf' THEN 'Revisão PDFlash' WHEN 'rq' THEN 'Revisão Questões' WHEN 'jp' THEN 'Jurisprudência' ELSE upper(g.chave) END
             WHEN 'semana' THEN 'Semana de ' || to_char(g.chave::date, 'DD/MM/YYYY')
             ELSE COALESCE(NULLIF(g.chave, ''), 'Sem disciplina') END AS rotulo,
           g.planejadas, g.feitas, g.nao_realizadas, g.atrasadas,
           round(100.0 * g.feitas / NULLIF(g.planejadas, 0), 1) AS pct_feitas,
           g.tempo_plan_seg, g.tempo_real_seg, g.res, g.err
      FROM g
  )
  SELECT r.chave, r.rotulo, r.planejadas, r.feitas, r.nao_realizadas, r.atrasadas, r.pct_feitas, r.tempo_plan_seg, r.tempo_real_seg, r.res, r.err, count(*) OVER ()::bigint
    FROM r
   WHERE (p_busca IS NULL OR p_busca = '' OR r.rotulo ILIKE '%' || p_busca || '%')
   ORDER BY (CASE p_ordem WHEN 'planejadas' THEN r.planejadas WHEN 'feitas' THEN r.feitas WHEN 'nao_realizadas' THEN r.nao_realizadas WHEN 'atrasadas' THEN r.atrasadas
                          WHEN 'pct_feitas' THEN r.pct_feitas WHEN 'tempo_plan_seg' THEN r.tempo_plan_seg WHEN 'tempo_real_seg' THEN r.tempo_real_seg END)
            * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            (CASE WHEN p_ordem = 'rotulo' AND p_dir = 'asc' THEN r.rotulo END) ASC,
            (CASE WHEN p_ordem = 'rotulo' AND p_dir <> 'asc' THEN r.rotulo END) DESC,
            (CASE WHEN p_param = 'semana' THEN r.chave END) DESC,
            r.planejadas DESC, r.rotulo
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Progresso: funil de cumprimento (alunos) ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_funil(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (ordem int, etapa text, alunos bigint, pct numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Fortaleza')::date AS d),
  por AS (   -- por aluno: metas VENCIDAS (data prevista até hoje) e quantas feitas, somando os planos ativos
    SELECT pm.estudante_id,
           count(*) FILTER (WHERE pm.data_prevista <= (SELECT d FROM hoje)) AS venc,
           count(*) FILTER (WHERE pm.data_prevista <= (SELECT d FROM hoje) AND m.estado = 'done') AS feitas_v,
           count(*) FILTER (WHERE m.estado IN ('done','missed') OR COALESCE(m.tempo_seg, 0) > 0) AS tocou
      FROM public.simulado_cronograma_adaptativo_plano_meta pm
      JOIN public.simulado_cronograma_adaptativo_plano pl ON pl.id = pm.plano_id AND pl.arquivada = false AND pl.exemplo = false
      LEFT JOIN public.simulado_cronograma_adaptativo_meta m ON m.plano_id = pm.plano_id AND m.meta_id = pm.meta_id AND m.arquivada = false
     WHERE pm.tenant_id = p_tenant
       AND (p_motor IS NULL OR COALESCE(pl.motor, pl.cfg->>'motor') = p_motor)
       AND (p_disciplina IS NULL OR COALESCE(NULLIF(btrim(pm.disciplina), ''), '') = p_disciplina)
       AND (p_tipo IS NULL OR pm.tipo = p_tipo)
       AND (p_grupo IS NULL OR pm.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
     GROUP BY pm.estudante_id
  ), e AS (
    SELECT 1 AS o, 'Alunos com cronograma' AS etapa, count(*) AS n FROM por
    UNION ALL SELECT 2, 'Já marcaram ou estudaram alguma meta', count(*) FROM por WHERE tocou > 0
    UNION ALL SELECT 3, 'Cumpriram 25% ou mais do que venceu', count(*) FROM por WHERE venc > 0 AND feitas_v::numeric / venc >= 0.25
    UNION ALL SELECT 4, 'Cumpriram 50% ou mais do que venceu', count(*) FROM por WHERE venc > 0 AND feitas_v::numeric / venc >= 0.50
    UNION ALL SELECT 5, 'Cumpriram 75% ou mais do que venceu', count(*) FROM por WHERE venc > 0 AND feitas_v::numeric / venc >= 0.75
    UNION ALL SELECT 6, 'Cumpriram 100% do que venceu', count(*) FROM por WHERE venc > 0 AND feitas_v >= venc
  )
  SELECT e.o, e.etapa, e.n, round(100.0 * e.n / NULLIF((SELECT n FROM e WHERE o = 1), 0), 1), 6::bigint
    FROM e ORDER BY e.o
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Progresso: alunos parados (p_param = dias sem atividade, padrão 7) ──────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_parados(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (estudante_id uuid, nome text, email text, plano_id uuid, fixado boolean, ultima timestamptz, dias_parado integer, atrasadas bigint, feitas bigint, vencidas bigint, planos_n bigint, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Fortaleza')::date AS d),
  ag AS (
    SELECT pm.plano_id,
           count(*) FILTER (WHERE pm.data_prevista <= (SELECT d FROM hoje)) AS vencidas,
           count(*) FILTER (WHERE pm.data_prevista <= (SELECT d FROM hoje) AND m.estado = 'done') AS feitas,
           count(*) FILTER (WHERE pm.data_prevista < (SELECT d FROM hoje) AND m.estado IS NULL) AS atrasadas,
           max(m.atualizado_em) FILTER (WHERE m.estado IS NOT NULL OR COALESCE(m.tempo_seg, 0) > 0) AS ultima
      FROM public.simulado_cronograma_adaptativo_plano_meta pm
      LEFT JOIN public.simulado_cronograma_adaptativo_meta m ON m.plano_id = pm.plano_id AND m.meta_id = pm.meta_id AND m.arquivada = false
     WHERE pm.tenant_id = p_tenant
       AND (p_disciplina IS NULL OR COALESCE(NULLIF(btrim(pm.disciplina), ''), '') = p_disciplina)
       AND (p_tipo IS NULL OR pm.tipo = p_tipo)
     GROUP BY pm.plano_id
  ), npl AS (
    SELECT p.estudante_id, count(*) AS n FROM public.simulado_cronograma_adaptativo_plano p
     WHERE p.tenant_id = p_tenant AND p.arquivada = false AND p.exemplo = false GROUP BY p.estudante_id
  ), x AS (
    SELECT p.estudante_id, p.id AS plano_id, p.fixado, COALESCE(ag.ultima, p.criado_em) AS ultima,
           ((SELECT d FROM hoje) - (COALESCE(ag.ultima, p.criado_em) AT TIME ZONE 'America/Fortaleza')::date)::int AS dias_parado,
           ag.atrasadas, ag.feitas, ag.vencidas, npl.n AS planos_n
      FROM public.simulado_cronograma_adaptativo_plano p
      JOIN ag ON ag.plano_id = p.id
      JOIN npl ON npl.estudante_id = p.estudante_id
     WHERE p.tenant_id = p_tenant AND p.arquivada = false AND p.exemplo = false AND p.pausa IS NULL
       AND ag.vencidas > 0 AND ag.feitas < ag.vencidas
       AND (p_motor IS NULL OR COALESCE(p.motor, p.cfg->>'motor') = p_motor)
       AND (p_grupo IS NULL OR p.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
  )
  SELECT x.estudante_id, es.nome, es.email, x.plano_id, x.fixado, x.ultima, x.dias_parado, x.atrasadas, x.feitas, x.vencidas, x.planos_n, count(*) OVER ()::bigint
    FROM x JOIN public.simulado_estudantes es ON es.id = x.estudante_id
   WHERE x.dias_parado >= COALESCE(NULLIF(p_param, '')::int, 7)
     AND (p_busca IS NULL OR p_busca = '' OR es.nome ILIKE '%' || p_busca || '%' OR COALESCE(es.email, '') ILIKE '%' || p_busca || '%')
   ORDER BY (CASE p_ordem WHEN 'dias_parado' THEN x.dias_parado WHEN 'atrasadas' THEN x.atrasadas WHEN 'feitas' THEN x.feitas WHEN 'vencidas' THEN x.vencidas WHEN 'planos_n' THEN x.planos_n END)
            * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            (CASE WHEN p_ordem = 'nome' AND p_dir = 'asc' THEN es.nome END) ASC,
            (CASE WHEN p_ordem = 'nome' AND p_dir <> 'asc' THEN es.nome END) DESC,
            x.dias_parado DESC, es.nome, x.plano_id
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Progresso: planos fixados × não fixados e alunos com vários planos ──────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_fixacao(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (ordem int, rotulo text, planos bigint, alunos bigint, vencidas bigint, feitas bigint, pct_feitas numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Fortaleza')::date AS d),
  pl AS (
    SELECT p.id, p.estudante_id, p.fixado FROM public.simulado_cronograma_adaptativo_plano p
     WHERE p.tenant_id = p_tenant AND p.arquivada = false AND p.exemplo = false
       AND (p_motor IS NULL OR COALESCE(p.motor, p.cfg->>'motor') = p_motor)
       AND (p_grupo IS NULL OR p.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
  ), ag AS (
    SELECT pm.plano_id,
           count(*) FILTER (WHERE pm.data_prevista <= (SELECT d FROM hoje)) AS venc,
           count(*) FILTER (WHERE pm.data_prevista <= (SELECT d FROM hoje) AND m.estado = 'done') AS feitas
      FROM public.simulado_cronograma_adaptativo_plano_meta pm
      LEFT JOIN public.simulado_cronograma_adaptativo_meta m ON m.plano_id = pm.plano_id AND m.meta_id = pm.meta_id AND m.arquivada = false
     WHERE pm.tenant_id = p_tenant AND pm.plano_id IN (SELECT id FROM pl)
     GROUP BY pm.plano_id
  ), pp AS (
    SELECT pl.*, COALESCE(ag.venc, 0) AS venc, COALESCE(ag.feitas, 0) AS feitas FROM pl LEFT JOIN ag ON ag.plano_id = pl.id
  ), alu AS (SELECT estudante_id, count(*) AS n FROM pl GROUP BY estudante_id),
  e AS (
    SELECT 1 AS o, 'Planos fixados (em foco)' AS rotulo, count(*) AS planos, count(DISTINCT estudante_id) AS alunos, sum(venc) AS v, sum(feitas) AS f FROM pp WHERE fixado
    UNION ALL SELECT 2, 'Planos não fixados', count(*), count(DISTINCT estudante_id), sum(venc), sum(feitas) FROM pp WHERE NOT fixado
    UNION ALL SELECT 3, 'Alunos com 1 plano ativo', sum(n), count(*), NULL, NULL FROM alu WHERE n = 1
    UNION ALL SELECT 4, 'Alunos com 2 planos ativos', sum(n), count(*), NULL, NULL FROM alu WHERE n = 2
    UNION ALL SELECT 5, 'Alunos com 3 ou mais planos ativos', sum(n), count(*), NULL, NULL FROM alu WHERE n >= 3
  )
  SELECT e.o, e.rotulo, COALESCE(e.planos, 0)::bigint, COALESCE(e.alunos, 0)::bigint, e.v::bigint, e.f::bigint, round(100.0 * e.f / NULLIF(e.v, 0), 1), 5::bigint
    FROM e ORDER BY e.o
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Progresso: marcações por dia (eventos marcar/desmarcar) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_ev_dia(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (dia date, concluidas bigint, nao_realizadas bigint, desmarcadas bigint, alunos bigint, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (
    SELECT (e.em AT TIME ZONE 'America/Fortaleza')::date AS dia,
           count(*) FILTER (WHERE e.para = 'done') AS concluidas,
           count(*) FILTER (WHERE e.para = 'missed') AS nao_realizadas,
           count(*) FILTER (WHERE e.de IS NOT NULL AND e.para IS NULL) AS desmarcadas,
           count(DISTINCT e.estudante_id) AS alunos
      FROM public.simulado_cronograma_adaptativo_meta_evento e
     WHERE e.tenant_id = p_tenant
       AND (p_de IS NULL OR e.em >= (p_de::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_ate IS NULL OR e.em < ((p_ate + 1)::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_tipo IS NULL OR split_part(e.meta_id, ':', 1) = p_tipo)
       AND (p_grupo IS NULL OR e.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
     GROUP BY 1
  )
  SELECT a.dia, a.concluidas, a.nao_realizadas, a.desmarcadas, a.alunos, count(*) OVER ()::bigint
    FROM a
   ORDER BY (CASE p_ordem WHEN 'dia' THEN extract(epoch FROM a.dia::timestamp)::numeric WHEN 'concluidas' THEN a.concluidas WHEN 'nao_realizadas' THEN a.nao_realizadas
                          WHEN 'desmarcadas' THEN a.desmarcadas WHEN 'alunos' THEN a.alunos END) * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            a.dia DESC
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Atraso real (p_param = visão: tipo | disciplina). atraso = concluido_em − data_prevista (dias, mínimo 0) ──────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_atraso(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (rotulo text, concluidas bigint, no_prazo_pct numeric, mediana_dias numeric, p90_dias numeric, max_dias integer, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT CASE WHEN p_param = 'disciplina' THEN COALESCE(NULLIF(btrim(pm.disciplina), ''), 'Sem disciplina')
                ELSE CASE pm.tipo WHEN 'pf' THEN 'PDFull' WHEN 'pp' THEN 'PDFull (parte)' WHEN 'fl' THEN 'PDFlash' WHEN 'qu' THEN 'Questões' WHEN 'lp' THEN 'LegProc'
                                  WHEN 'rf' THEN 'Revisão PDFlash' WHEN 'rq' THEN 'Revisão Questões' WHEN 'jp' THEN 'Jurisprudência' ELSE upper(pm.tipo) END END AS rotulo,
           greatest((m.concluido_em - pm.data_prevista), 0) AS atraso
      FROM public.simulado_cronograma_adaptativo_meta m
      JOIN public.simulado_cronograma_adaptativo_plano_meta pm ON pm.plano_id = m.plano_id AND pm.meta_id = m.meta_id AND pm.tenant_id = p_tenant
      JOIN public.simulado_cronograma_adaptativo_plano pl ON pl.id = pm.plano_id AND pl.arquivada = false AND pl.exemplo = false
     WHERE m.tenant_id = p_tenant AND m.estado = 'done' AND m.concluido_em IS NOT NULL AND m.arquivada = false
       AND (p_de IS NULL OR m.concluido_em >= p_de) AND (p_ate IS NULL OR m.concluido_em <= p_ate)
       AND (p_disciplina IS NULL OR COALESCE(NULLIF(btrim(pm.disciplina), ''), '') = p_disciplina)
       AND (p_tipo IS NULL OR pm.tipo = p_tipo)
       AND (p_motor IS NULL OR COALESCE(pl.motor, pl.cfg->>'motor') = p_motor)
       AND (p_grupo IS NULL OR pm.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
  ), a AS (
    SELECT rotulo, count(*) AS concluidas, round(100.0 * count(*) FILTER (WHERE atraso = 0) / count(*), 1) AS no_prazo_pct,
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY atraso))::numeric, 1) AS mediana_dias,
           round((percentile_cont(0.9) WITHIN GROUP (ORDER BY atraso))::numeric, 1) AS p90_dias, max(atraso)::int AS max_dias
      FROM b GROUP BY rotulo
    UNION ALL
    SELECT 'Todas as metas', count(*), round(100.0 * count(*) FILTER (WHERE atraso = 0) / count(*), 1),
           round((percentile_cont(0.5) WITHIN GROUP (ORDER BY atraso))::numeric, 1), round((percentile_cont(0.9) WITHIN GROUP (ORDER BY atraso))::numeric, 1), max(atraso)::int
      FROM b HAVING count(*) > 0
  )
  SELECT a.rotulo, a.concluidas, a.no_prazo_pct, a.mediana_dias, a.p90_dias, a.max_dias, count(*) OVER ()::bigint
    FROM a
   WHERE (p_busca IS NULL OR p_busca = '' OR a.rotulo ILIKE '%' || p_busca || '%')
   ORDER BY (CASE p_ordem WHEN 'concluidas' THEN a.concluidas WHEN 'no_prazo_pct' THEN a.no_prazo_pct WHEN 'mediana_dias' THEN a.mediana_dias WHEN 'p90_dias' THEN a.p90_dias WHEN 'max_dias' THEN a.max_dias END)
            * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            (CASE WHEN p_ordem = 'rotulo' AND p_dir = 'asc' THEN a.rotulo END) ASC,
            (CASE WHEN p_ordem = 'rotulo' AND p_dir <> 'asc' THEN a.rotulo END) DESC,
            (a.rotulo = 'Todas as metas') DESC, a.concluidas DESC, a.rotulo
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Desempenho (p_param = visão: materia | aula | turma). acerto = (res − err) / res ─────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_desempenho(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (rotulo text, detalhe text, metas bigint, alunos bigint, res bigint, err bigint, acerto_pct numeric, estrelas_media numeric, grau_medio numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT pm.estudante_id, pm.meta_id, COALESCE(NULLIF(btrim(pm.disciplina), ''), 'Sem disciplina') AS disciplina,
           COALESCE(pm.aula_key, pm.meta_id) AS aula_key, COALESCE(NULLIF(btrim(pm.titulo), ''), 'Aula ' || COALESCE(pm.aula, '?')) AS titulo,
           m.res, m.err, m.estrelas, m.grau
      FROM public.simulado_cronograma_adaptativo_meta m
      JOIN public.simulado_cronograma_adaptativo_plano_meta pm ON pm.plano_id = m.plano_id AND pm.meta_id = m.meta_id AND pm.tenant_id = p_tenant
      JOIN public.simulado_cronograma_adaptativo_plano pl ON pl.id = pm.plano_id AND pl.arquivada = false AND pl.exemplo = false
     WHERE m.tenant_id = p_tenant AND m.arquivada = false
       AND (COALESCE(m.res, 0) > 0 OR m.estrelas IS NOT NULL OR m.grau IS NOT NULL)
       AND COALESCE(m.concluido_em, (m.atualizado_em AT TIME ZONE 'America/Fortaleza')::date) BETWEEN COALESCE(p_de, '1900-01-01'::date) AND COALESCE(p_ate, '2999-12-31'::date)
       AND (p_disciplina IS NULL OR COALESCE(NULLIF(btrim(pm.disciplina), ''), '') = p_disciplina)
       AND (p_tipo IS NULL OR pm.tipo = p_tipo)
       AND (p_motor IS NULL OR COALESCE(pl.motor, pl.cfg->>'motor') = p_motor)
       AND (p_grupo IS NULL OR pm.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
  ), k AS (
    SELECT CASE COALESCE(p_param, 'materia') WHEN 'aula' THEN b.aula_key WHEN 'turma' THEN gm.grupo_id::text ELSE b.disciplina END AS chave,
           CASE COALESCE(p_param, 'materia') WHEN 'aula' THEN b.titulo ELSE NULL END AS titulo,
           CASE COALESCE(p_param, 'materia') WHEN 'aula' THEN b.disciplina ELSE NULL END AS detalhe,
           b.estudante_id, b.res, b.err, b.estrelas, b.grau
      FROM b
      LEFT JOIN public.simulado_grupo_membros gm ON COALESCE(p_param, 'materia') = 'turma' AND gm.tenant_id = p_tenant AND gm.estudante_id = b.estudante_id
     WHERE COALESCE(p_param, 'materia') <> 'turma' OR gm.grupo_id IS NOT NULL
  ), a AS (
    SELECT k.chave, max(k.titulo) AS titulo, max(k.detalhe) AS detalhe, count(*) AS metas, count(DISTINCT k.estudante_id) AS alunos,
           COALESCE(sum(k.res), 0)::bigint AS res, COALESCE(sum(k.err), 0)::bigint AS err,
           round(100.0 * (COALESCE(sum(k.res), 0) - COALESCE(sum(k.err), 0)) / NULLIF(sum(k.res), 0), 1) AS acerto_pct,
           round(avg(k.estrelas), 2) AS estrelas_media, round(avg(k.grau), 1) AS grau_medio
      FROM k GROUP BY k.chave
  ), r AS (
    SELECT CASE COALESCE(p_param, 'materia') WHEN 'turma' THEN COALESCE((SELECT gr.nome FROM public.simulado_grupos gr WHERE gr.id::text = a.chave), 'Turma removida')
                                              WHEN 'aula' THEN COALESCE(a.titulo, a.chave) ELSE a.chave END AS rotulo,
           a.detalhe, a.metas, a.alunos, a.res, a.err, a.acerto_pct, a.estrelas_media, a.grau_medio
      FROM a
  )
  SELECT r.rotulo, r.detalhe, r.metas, r.alunos, r.res, r.err, r.acerto_pct, r.estrelas_media, r.grau_medio, count(*) OVER ()::bigint
    FROM r
   WHERE (p_busca IS NULL OR p_busca = '' OR r.rotulo ILIKE '%' || p_busca || '%' OR COALESCE(r.detalhe, '') ILIKE '%' || p_busca || '%')
   ORDER BY (CASE p_ordem WHEN 'metas' THEN r.metas WHEN 'alunos' THEN r.alunos WHEN 'res' THEN r.res WHEN 'err' THEN r.err WHEN 'acerto_pct' THEN r.acerto_pct
                          WHEN 'estrelas_media' THEN r.estrelas_media WHEN 'grau_medio' THEN r.grau_medio END) * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            (CASE WHEN p_ordem = 'rotulo' AND p_dir = 'asc' THEN r.rotulo END) ASC,
            (CASE WHEN p_ordem = 'rotulo' AND p_dir <> 'asc' THEN r.rotulo END) DESC,
            r.metas DESC, r.rotulo
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Tempo: ritmo real × velocidade de leitura (vel) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_ritmo(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (vel text, planos bigint, metas bigint, planejado_seg bigint, real_seg bigint, razao numeric, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH b AS (
    SELECT COALESCE(round(pl.vel, 1)::text, 'Sem dado') AS vel, pl.id AS plano_id, round(COALESCE(pm.horas, 0) * 3600)::bigint AS plan_seg, m.tempo_seg::bigint AS real_seg
      FROM public.simulado_cronograma_adaptativo_meta m
      JOIN public.simulado_cronograma_adaptativo_plano_meta pm ON pm.plano_id = m.plano_id AND pm.meta_id = m.meta_id AND pm.tenant_id = p_tenant
      JOIN public.simulado_cronograma_adaptativo_plano pl ON pl.id = pm.plano_id AND pl.arquivada = false AND pl.exemplo = false
     WHERE m.tenant_id = p_tenant AND m.estado = 'done' AND m.tempo_seg > 0 AND m.arquivada = false
       AND (p_de IS NULL OR m.concluido_em >= p_de) AND (p_ate IS NULL OR m.concluido_em <= p_ate)
       AND (p_disciplina IS NULL OR COALESCE(NULLIF(btrim(pm.disciplina), ''), '') = p_disciplina)
       AND (p_tipo IS NULL OR pm.tipo = p_tipo)
       AND (p_motor IS NULL OR COALESCE(pl.motor, pl.cfg->>'motor') = p_motor)
       AND (p_grupo IS NULL OR pm.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
  ), a AS (
    SELECT b.vel, count(DISTINCT b.plano_id) AS planos, count(*) AS metas, sum(b.plan_seg)::bigint AS planejado_seg, sum(b.real_seg)::bigint AS real_seg,
           round(sum(b.real_seg)::numeric / NULLIF(sum(b.plan_seg), 0), 2) AS razao
      FROM b GROUP BY b.vel
  )
  SELECT a.vel, a.planos, a.metas, a.planejado_seg, a.real_seg, a.razao, count(*) OVER ()::bigint
    FROM a
   WHERE (p_busca IS NULL OR p_busca = '' OR a.vel ILIKE '%' || p_busca || '%')
   ORDER BY (CASE p_ordem WHEN 'planos' THEN a.planos WHEN 'metas' THEN a.metas WHEN 'planejado_seg' THEN a.planejado_seg WHEN 'real_seg' THEN a.real_seg WHEN 'razao' THEN a.razao END)
            * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            a.metas DESC, a.vel
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Material: metas de leitura sem documento vinculado ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_sem_doc(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (tipo text, disciplina text, titulo text, metas bigint, alunos bigint, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (
    SELECT pm.tipo, COALESCE(NULLIF(btrim(pm.disciplina), ''), 'Sem disciplina') AS disciplina,
           COALESCE(NULLIF(btrim(pm.titulo), ''), 'Aula ' || COALESCE(pm.aula, '?')) AS titulo,
           count(*) AS metas, count(DISTINCT pm.estudante_id) AS alunos
      FROM public.simulado_cronograma_adaptativo_plano_meta pm
      JOIN public.simulado_cronograma_adaptativo_plano pl ON pl.id = pm.plano_id AND pl.arquivada = false AND pl.exemplo = false
     WHERE pm.tenant_id = p_tenant AND pm.documento_id IS NULL AND pm.tipo IN ('pf','pp','fl','rf','lp')
       AND (p_disciplina IS NULL OR COALESCE(NULLIF(btrim(pm.disciplina), ''), '') = p_disciplina)
       AND (p_tipo IS NULL OR pm.tipo = p_tipo)
       AND (p_motor IS NULL OR COALESCE(pl.motor, pl.cfg->>'motor') = p_motor)
       AND (p_grupo IS NULL OR pm.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
     GROUP BY 1, 2, 3
  )
  SELECT a.tipo, a.disciplina, a.titulo, a.metas, a.alunos, count(*) OVER ()::bigint
    FROM a
   WHERE (p_busca IS NULL OR p_busca = '' OR a.titulo ILIKE '%' || p_busca || '%' OR a.disciplina ILIKE '%' || p_busca || '%')
   ORDER BY (CASE p_ordem WHEN 'metas' THEN a.metas WHEN 'alunos' THEN a.alunos END) * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            (CASE WHEN p_ordem = 'titulo' AND p_dir = 'asc' THEN a.titulo END) ASC,
            (CASE WHEN p_ordem = 'titulo' AND p_dir <> 'asc' THEN a.titulo END) DESC,
            (CASE WHEN p_ordem = 'disciplina' AND p_dir = 'asc' THEN a.disciplina END) ASC,
            (CASE WHEN p_ordem = 'disciplina' AND p_dir <> 'asc' THEN a.disciplina END) DESC,
            a.metas DESC, a.disciplina, a.titulo
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── Material: progresso órfão (progresso sem meta correspondente na grade) por plano ────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_orfas(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text,
  p_busca text, p_ordem text, p_dir text, p_limite int, p_offset int, p_param text DEFAULT NULL
) RETURNS TABLE (estudante_id uuid, nome text, email text, plano_id uuid, orfas bigint, orfas_feitas bigint, total_linhas bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH o AS (
    SELECT m.plano_id, m.estudante_id, count(*) AS orfas, count(*) FILTER (WHERE m.estado = 'done') AS orfas_feitas
      FROM public.simulado_cronograma_adaptativo_meta m
     WHERE m.tenant_id = p_tenant AND m.arquivada = false
       AND EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id)
       AND NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id)
       AND (p_grupo IS NULL OR m.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
     GROUP BY m.plano_id, m.estudante_id
  )
  SELECT o.estudante_id, es.nome, es.email, o.plano_id, o.orfas, o.orfas_feitas, count(*) OVER ()::bigint
    FROM o JOIN public.simulado_estudantes es ON es.id = o.estudante_id
   WHERE (p_busca IS NULL OR p_busca = '' OR es.nome ILIKE '%' || p_busca || '%' OR COALESCE(es.email, '') ILIKE '%' || p_busca || '%')
   ORDER BY (CASE p_ordem WHEN 'orfas' THEN o.orfas WHEN 'orfas_feitas' THEN o.orfas_feitas END) * (CASE WHEN p_dir = 'asc' THEN 1 ELSE -1 END) NULLS LAST,
            (CASE WHEN p_ordem = 'nome' AND p_dir = 'asc' THEN es.nome END) ASC,
            (CASE WHEN p_ordem = 'nome' AND p_dir <> 'asc' THEN es.nome END) DESC,
            o.orfas DESC, es.nome, o.plano_id
   LIMIT greatest(p_limite, 1) OFFSET greatest(p_offset, 0);
$$;

-- ── KPIs do topo (jsonb) — p_param = dias de "parado" (padrão 7) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_resumo(
  p_tenant uuid, p_de date, p_ate date, p_grupo uuid, p_disciplina text, p_tipo text, p_motor text, p_param text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH hoje AS (SELECT (now() AT TIME ZONE 'America/Fortaleza')::date AS d),
  pl AS (
    SELECT p.id, p.estudante_id, p.fixado, p.pausa FROM public.simulado_cronograma_adaptativo_plano p
     WHERE p.tenant_id = p_tenant AND p.arquivada = false AND p.exemplo = false
       AND (p_motor IS NULL OR COALESCE(p.motor, p.cfg->>'motor') = p_motor)
       AND (p_grupo IS NULL OR p.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
  ), alu AS (SELECT estudante_id, count(*) AS n FROM pl GROUP BY estudante_id),
  lg AS (
    SELECT count(*) FILTER (WHERE g.acao IN ('gerar','recalcular','migrar') AND g.ok) AS geracoes,
           count(*) FILTER (WHERE g.acao = 'recalcular' AND g.ok) AS recalculos,
           count(*) FILTER (WHERE NOT g.ok) AS falhas
      FROM public.simulado_cronograma_adaptativo_geracao_log g
     WHERE g.tenant_id = p_tenant
       AND (p_de IS NULL OR g.criado_em >= (p_de::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_ate IS NULL OR g.criado_em < ((p_ate + 1)::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_motor IS NULL OR g.motor = p_motor)
       AND (p_grupo IS NULL OR g.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
  ), ag AS (
    SELECT COALESCE(sum(a.planejadas), 0) AS planejadas, COALESCE(sum(a.feitas), 0) AS feitas, COALESCE(sum(a.nao_realizadas), 0) AS nao_realizadas,
           COALESCE(sum(a.atrasadas), 0) AS atrasadas, COALESCE(sum(a.tempo_plan_seg), 0) AS tempo_plan_seg, COALESCE(sum(a.tempo_real_seg), 0) AS tempo_real_seg,
           COALESCE(sum(a.res), 0) AS res, COALESCE(sum(a.err), 0) AS err
      FROM public.simulado_cronograma_adaptativo_agg_dia a
     WHERE a.tenant_id = p_tenant AND a.grupo_id IS NOT DISTINCT FROM p_grupo
       AND (p_de IS NULL OR a.dia >= p_de) AND (p_ate IS NULL OR a.dia <= p_ate)
       AND (p_disciplina IS NULL OR COALESCE(a.disciplina, '') = p_disciplina) AND (p_tipo IS NULL OR a.tipo = p_tipo)
  ), pa AS (
    SELECT pm.plano_id,
           count(*) FILTER (WHERE pm.data_prevista <= (SELECT d FROM hoje)) AS venc,
           count(*) FILTER (WHERE pm.data_prevista <= (SELECT d FROM hoje) AND m.estado = 'done') AS feitas,
           max(m.atualizado_em) FILTER (WHERE m.estado IS NOT NULL OR COALESCE(m.tempo_seg, 0) > 0) AS ultima
      FROM public.simulado_cronograma_adaptativo_plano_meta pm
      LEFT JOIN public.simulado_cronograma_adaptativo_meta m ON m.plano_id = pm.plano_id AND m.meta_id = pm.meta_id AND m.arquivada = false
     WHERE pm.tenant_id = p_tenant AND pm.plano_id IN (SELECT id FROM pl)
     GROUP BY pm.plano_id
  ), ev AS (
    SELECT count(*) FILTER (WHERE e.para = 'done') AS concluidas, count(*) FILTER (WHERE e.de IS NOT NULL AND e.para IS NULL) AS desmarcadas
      FROM public.simulado_cronograma_adaptativo_meta_evento e
     WHERE e.tenant_id = p_tenant
       AND (p_de IS NULL OR e.em >= (p_de::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_ate IS NULL OR e.em < ((p_ate + 1)::timestamp AT TIME ZONE 'America/Fortaleza'))
       AND (p_grupo IS NULL OR e.estudante_id IN (SELECT gm.estudante_id FROM public.simulado_grupo_membros gm WHERE gm.tenant_id = p_tenant AND gm.grupo_id = p_grupo))
  )
  SELECT jsonb_build_object(
    'alunos_com_plano', (SELECT count(*) FROM alu),
    'planos_ativos', (SELECT count(*) FROM pl),
    'planos_fixados', (SELECT count(*) FROM pl WHERE fixado),
    'alunos_multiplano', (SELECT count(*) FROM alu WHERE n > 1),
    'planos_pausados', (SELECT count(*) FROM pl WHERE pausa IS NOT NULL),
    'geracoes', (SELECT geracoes FROM lg), 'recalculos', (SELECT recalculos FROM lg), 'falhas', (SELECT falhas FROM lg),
    'planejadas', (SELECT planejadas FROM ag), 'feitas', (SELECT feitas FROM ag), 'nao_realizadas', (SELECT nao_realizadas FROM ag), 'atrasadas', (SELECT atrasadas FROM ag),
    'pct_feitas', (SELECT round(100.0 * feitas / NULLIF(planejadas, 0), 1) FROM ag), 'acerto_pct', (SELECT round(100.0 * (res - err) / NULLIF(res, 0), 1) FROM ag),
    'tempo_plan_seg', (SELECT tempo_plan_seg FROM ag), 'tempo_real_seg', (SELECT tempo_real_seg FROM ag), 'res', (SELECT res FROM ag), 'err', (SELECT err FROM ag),
    'parados', (SELECT count(*) FROM pl JOIN pa ON pa.plano_id = pl.id
                 WHERE pl.pausa IS NULL AND pa.venc > 0 AND pa.feitas < pa.venc
                   AND (SELECT d FROM hoje) - (COALESCE(pa.ultima, (SELECT p.criado_em FROM public.simulado_cronograma_adaptativo_plano p WHERE p.id = pl.id)) AT TIME ZONE 'America/Fortaleza')::date >= COALESCE(NULLIF(p_param, '')::int, 7)),
    'marcacoes', (SELECT concluidas FROM ev), 'desmarcacoes', (SELECT desmarcadas FROM ev),
    'log_desde', (SELECT min(criado_em) FROM public.simulado_cronograma_adaptativo_geracao_log WHERE tenant_id = p_tenant),
    'eventos_desde', (SELECT min(em) FROM public.simulado_cronograma_adaptativo_meta_evento WHERE tenant_id = p_tenant),
    'agg_atualizado', (SELECT max(atualizado_em) FROM public.simulado_cronograma_adaptativo_agg_dia WHERE tenant_id = p_tenant),
    'agg_linhas', (SELECT count(*) FROM public.simulado_cronograma_adaptativo_agg_dia WHERE tenant_id = p_tenant)
  );
$$;

-- ── Opções dos filtros (disciplinas, motores, tipos) — jsonb ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.simulado_cronograma_adaptativo_an_opcoes(p_tenant uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'disciplinas', COALESCE((SELECT jsonb_agg(d ORDER BY d) FROM (SELECT DISTINCT btrim(disciplina) AS d FROM public.simulado_cronograma_adaptativo_plano_disciplina WHERE tenant_id = p_tenant AND btrim(disciplina) <> '') x), '[]'::jsonb),
    'motores', COALESCE((SELECT jsonb_agg(m ORDER BY m DESC) FROM (SELECT DISTINCT COALESCE(motor, cfg->>'motor') AS m FROM public.simulado_cronograma_adaptativo_plano WHERE tenant_id = p_tenant AND exemplo = false) x WHERE m IS NOT NULL), '[]'::jsonb)
  );
$$;

-- ── Permissões das funções: só service_role (padrão 20261113041500) ─────────────────────────────
DO $$
DECLARE f record; r text;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND (p.proname LIKE 'simulado_cronograma_adaptativo\_an\_%' OR p.proname LIKE 'simulado_cronograma_adaptativo\_agg\_refresh%') LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM public', f.sig);
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f.sig, r); END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f.sig); END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
