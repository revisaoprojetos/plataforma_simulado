-- CRONOGRAMA ADAPTATIVO — desmembra o `cfg` (e extras/pausa) do plano em COLUNAS e TABELAS FILHAS.
-- Dual-write: o JSON continua sendo a fonte lida pelo motor/iframe; o app sincroniza estas linhas ao gravar o plano
-- (lib/cronograma/adaptativo/plano-metas.ts → sincronizarCfg). Esta migração cria a estrutura e PREENCHE tudo a partir do JSON atual.
-- Pré-requisito: 20261105050000_cronograma_adaptativo_plano_meta.sql. Idempotente. Aplicação manual no SQL Editor.

-- ── 1) escalares do cfg → colunas do plano ────────────────────────────────────────────────────────────────────
ALTER TABLE public.simulado_cronograma_adaptativo_plano
  ADD COLUMN IF NOT EXISTS start_data         date,
  ADD COLUMN IF NOT EXISTS arranjo            text,
  ADD COLUMN IF NOT EXISTS rev_ativa          boolean,
  ADD COLUMN IF NOT EXISTS rev_cada           integer,
  ADD COLUMN IF NOT EXISTS rev_modelo         text,
  ADD COLUMN IF NOT EXISTS vel                numeric,
  ADD COLUMN IF NOT EXISTS vel_seg            numeric,
  ADD COLUMN IF NOT EXISTS vel_fonte          text,
  ADD COLUMN IF NOT EXISTS mais_pdfull        boolean,
  ADD COLUMN IF NOT EXISTS ja_estuda_revisao  boolean,
  ADD COLUMN IF NOT EXISTS sem_data           boolean,
  ADD COLUMN IF NOT EXISTS motor              text,
  ADD COLUMN IF NOT EXISTS catalogo           text,
  ADD COLUMN IF NOT EXISTS metas_pf           boolean,
  ADD COLUMN IF NOT EXISTS metas_fl           boolean,
  ADD COLUMN IF NOT EXISTS metas_qu           boolean,
  ADD COLUMN IF NOT EXISTS metas_lp           boolean,
  ADD COLUMN IF NOT EXISTS metas_vd           boolean,
  ADD COLUMN IF NOT EXISTS pausa_desde        date;

-- ── 2) filhas do cfg (1:N) ────────────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_horas (
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, dia smallint NOT NULL CHECK (dia BETWEEN 0 AND 6), horas numeric(5,2) NOT NULL,
  PRIMARY KEY (plano_id, dia));
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_rotina (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  desde date NOT NULL, horas numeric(5,2)[] NOT NULL);
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_recesso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  ini date NOT NULL, fim date NOT NULL, motivo text);
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_hora_pontual (
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, data date NOT NULL, horas numeric(5,2) NOT NULL, PRIMARY KEY (plano_id, data));
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_disciplina (
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, ordem integer NOT NULL, disciplina text NOT NULL, PRIMARY KEY (plano_id, ordem));
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_ultimo_tema (
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, disciplina text NOT NULL, posicao integer NOT NULL, PRIMARY KEY (plano_id, disciplina));
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_pagina_lida (
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, tipo text NOT NULL DEFAULT 'paginas' CHECK (tipo IN ('paginas','partes')), aula_ref text NOT NULL, quantidade numeric NOT NULL,
  PRIMARY KEY (plano_id, tipo, aula_ref));
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_sobra (
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, meta_id text NOT NULL, minutos numeric NOT NULL, PRIMARY KEY (plano_id, meta_id));
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_remanejada (
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, meta_id text NOT NULL, desde date, minutos numeric, detalhe jsonb, PRIMARY KEY (plano_id, meta_id));
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_lp_ignorar (
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, meta_id text NOT NULL, PRIMARY KEY (plano_id, meta_id));
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_lp_legado (
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL, meta_id text NOT NULL, disciplina text, lei text, texto text, documento_id text, PRIMARY KEY (plano_id, meta_id));
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_extra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL,
  plano_id uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  ext_id text, data date, minutos integer, disciplina text, tipo text, nota text, em_ms bigint, criado_em timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_cron_adapt_extra_plano ON public.simulado_cronograma_adaptativo_plano_extra (plano_id, data);

-- RLS por tenant (mesmo padrão das demais)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plano_horas','plano_rotina','plano_recesso','plano_hora_pontual','plano_disciplina','plano_ultimo_tema','plano_pagina_lida','plano_sobra','plano_remanejada','plano_lp_ignorar','plano_lp_legado','plano_extra'] LOOP
    EXECUTE format('ALTER TABLE public.simulado_cronograma_adaptativo_%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS simulado_cronograma_adaptativo_%s_isolation ON public.simulado_cronograma_adaptativo_%I;', t, t);
    EXECUTE format($p$CREATE POLICY simulado_cronograma_adaptativo_%s_isolation ON public.simulado_cronograma_adaptativo_%I
      USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
  END LOOP;
END $$;

-- ── 3) PREENCHIMENTO a partir do JSON atual ──────────────────────────────────────────────────────────────────
UPDATE public.simulado_cronograma_adaptativo_plano p SET
  start_data        = CASE WHEN p.cfg->>'start' ~ '^\d{4}-\d{2}-\d{2}$' THEN (p.cfg->>'start')::date END,
  arranjo           = p.cfg->>'arranjo',
  rev_ativa         = CASE WHEN p.cfg->'revisao'->>'ativa' IN ('true','false') THEN (p.cfg->'revisao'->>'ativa')::boolean END,
  rev_cada          = CASE WHEN p.cfg->'revisao'->>'cada' ~ '^\d+$' THEN (p.cfg->'revisao'->>'cada')::int END,
  rev_modelo        = p.cfg->>'revModelo',
  vel               = CASE WHEN p.cfg->>'vel' ~ '^\d+(\.\d+)?$' THEN (p.cfg->>'vel')::numeric END,
  vel_seg           = CASE WHEN p.cfg->>'velSeg' ~ '^\d+(\.\d+)?$' THEN (p.cfg->>'velSeg')::numeric END,
  vel_fonte         = p.cfg->>'velFonte',
  mais_pdfull       = CASE WHEN p.cfg->>'maisPDFull' IN ('true','false') THEN (p.cfg->>'maisPDFull')::boolean END,
  ja_estuda_revisao = CASE WHEN p.cfg->>'jaEstudaRevisao' IN ('true','false') THEN (p.cfg->>'jaEstudaRevisao')::boolean END,
  sem_data          = CASE WHEN p.cfg->>'semData' IN ('true','false') THEN (p.cfg->>'semData')::boolean END,
  motor             = p.cfg->>'motor',
  catalogo          = p.cfg->>'catalogo',
  metas_pf          = CASE WHEN p.cfg->'metas'->>'pf' IN ('true','false') THEN (p.cfg->'metas'->>'pf')::boolean END,
  metas_fl          = CASE WHEN p.cfg->'metas'->>'fl' IN ('true','false') THEN (p.cfg->'metas'->>'fl')::boolean END,
  metas_qu          = CASE WHEN p.cfg->'metas'->>'qu' IN ('true','false') THEN (p.cfg->'metas'->>'qu')::boolean END,
  metas_lp          = CASE WHEN p.cfg->'metas'->>'lp' IN ('true','false') THEN (p.cfg->'metas'->>'lp')::boolean END,
  metas_vd          = CASE WHEN p.cfg->'metas'->>'vd' IN ('true','false') THEN (p.cfg->'metas'->>'vd')::boolean END,
  pausa_desde       = CASE WHEN p.pausa->>'desde' ~ '^\d{4}-\d{2}-\d{2}$' THEN (p.pausa->>'desde')::date END;

INSERT INTO public.simulado_cronograma_adaptativo_plano_horas (plano_id, tenant_id, dia, horas)
  SELECT p.id, p.tenant_id, (h.i - 1)::smallint, h.v::numeric
    FROM public.simulado_cronograma_adaptativo_plano p
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.cfg->'horas') = 'array' THEN p.cfg->'horas' ELSE '[]'::jsonb END) WITH ORDINALITY AS h(v, i)
   WHERE jsonb_typeof(p.cfg->'horas') = 'array' AND h.i <= 7 AND h.v ~ '^\d+(\.\d+)?$'
  ON CONFLICT DO NOTHING;

INSERT INTO public.simulado_cronograma_adaptativo_plano_rotina (tenant_id, plano_id, desde, horas)
  SELECT p.tenant_id, p.id, (r->>'desde')::date, ARRAY(SELECT x::numeric FROM jsonb_array_elements_text(CASE WHEN jsonb_typeof(r->'horas') = 'array' THEN r->'horas' ELSE '[]'::jsonb END) x)
    FROM public.simulado_cronograma_adaptativo_plano p
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.cfg->'rotinas') = 'array' THEN p.cfg->'rotinas' ELSE '[]'::jsonb END) r
   WHERE jsonb_typeof(p.cfg->'rotinas') = 'array' AND r->>'desde' ~ '^\d{4}-\d{2}-\d{2}$' AND jsonb_typeof(r->'horas') = 'array'
     AND NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_rotina x WHERE x.plano_id = p.id);

INSERT INTO public.simulado_cronograma_adaptativo_plano_recesso (tenant_id, plano_id, ini, fim, motivo)
  SELECT p.tenant_id, p.id, (r->>'ini')::date, (r->>'fim')::date, r->>'motivo'
    FROM public.simulado_cronograma_adaptativo_plano p
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.cfg->'recessos') = 'array' THEN p.cfg->'recessos' ELSE '[]'::jsonb END) r
   WHERE jsonb_typeof(p.cfg->'recessos') = 'array' AND r->>'ini' ~ '^\d{4}-\d{2}-\d{2}$' AND r->>'fim' ~ '^\d{4}-\d{2}-\d{2}$'
     AND NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_recesso x WHERE x.plano_id = p.id);

INSERT INTO public.simulado_cronograma_adaptativo_plano_hora_pontual (plano_id, tenant_id, data, horas)
  SELECT p.id, p.tenant_id, e.key::date, e.value::text::numeric
    FROM public.simulado_cronograma_adaptativo_plano p
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.cfg->'horasPontuais') = 'object' THEN p.cfg->'horasPontuais' ELSE '{}'::jsonb END) e
   WHERE jsonb_typeof(p.cfg->'horasPontuais') = 'object' AND e.key ~ '^\d{4}-\d{2}-\d{2}$' AND jsonb_typeof(e.value) = 'number'
  ON CONFLICT DO NOTHING;

INSERT INTO public.simulado_cronograma_adaptativo_plano_disciplina (plano_id, tenant_id, ordem, disciplina)
  SELECT p.id, p.tenant_id, (d.i - 1)::int, d.v
    FROM public.simulado_cronograma_adaptativo_plano p
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.cfg->'discs') = 'array' THEN p.cfg->'discs' ELSE '[]'::jsonb END) WITH ORDINALITY AS d(v, i)
   WHERE jsonb_typeof(p.cfg->'discs') = 'array'
  ON CONFLICT DO NOTHING;

INSERT INTO public.simulado_cronograma_adaptativo_plano_ultimo_tema (plano_id, tenant_id, disciplina, posicao)
  SELECT p.id, p.tenant_id, e.key, e.value::text::numeric::int
    FROM public.simulado_cronograma_adaptativo_plano p
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.cfg->'ultimosTemas') = 'object' THEN p.cfg->'ultimosTemas' ELSE '{}'::jsonb END) e
   WHERE jsonb_typeof(p.cfg->'ultimosTemas') = 'object' AND jsonb_typeof(e.value) = 'number'
  ON CONFLICT DO NOTHING;

INSERT INTO public.simulado_cronograma_adaptativo_plano_pagina_lida (plano_id, tenant_id, tipo, aula_ref, quantidade)
  SELECT p.id, p.tenant_id, 'paginas', e.key, e.value::text::numeric
    FROM public.simulado_cronograma_adaptativo_plano p
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.cfg->'paginasLidas') = 'object' THEN p.cfg->'paginasLidas' ELSE '{}'::jsonb END) e
   WHERE jsonb_typeof(p.cfg->'paginasLidas') = 'object' AND jsonb_typeof(e.value) = 'number'
  ON CONFLICT DO NOTHING;

INSERT INTO public.simulado_cronograma_adaptativo_plano_sobra (plano_id, tenant_id, meta_id, minutos)
  SELECT p.id, p.tenant_id, e.key, e.value::text::numeric
    FROM public.simulado_cronograma_adaptativo_plano p
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.cfg->'sobras') = 'object' THEN p.cfg->'sobras' ELSE '{}'::jsonb END) e
   WHERE jsonb_typeof(p.cfg->'sobras') = 'object' AND jsonb_typeof(e.value) = 'number'
  ON CONFLICT DO NOTHING;

INSERT INTO public.simulado_cronograma_adaptativo_plano_lp_ignorar (plano_id, tenant_id, meta_id)
  SELECT p.id, p.tenant_id, x
    FROM public.simulado_cronograma_adaptativo_plano p
    CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(p.cfg->'lpIgnorar') = 'array' THEN p.cfg->'lpIgnorar' ELSE '[]'::jsonb END) x
   WHERE jsonb_typeof(p.cfg->'lpIgnorar') = 'array'
  ON CONFLICT DO NOTHING;

INSERT INTO public.simulado_cronograma_adaptativo_plano_lp_legado (plano_id, tenant_id, meta_id, disciplina, lei, texto, documento_id)
  SELECT p.id, p.tenant_id, e.key, e.value->>'disc', e.value->>'lei', e.value->>'texto', e.value->>'doc'
    FROM public.simulado_cronograma_adaptativo_plano p
    CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.cfg->'lpLegado') = 'object' THEN p.cfg->'lpLegado' ELSE '{}'::jsonb END) e
   WHERE jsonb_typeof(p.cfg->'lpLegado') = 'object' AND jsonb_typeof(e.value) = 'object'
  ON CONFLICT DO NOTHING;

INSERT INTO public.simulado_cronograma_adaptativo_plano_extra (tenant_id, plano_id, ext_id, data, minutos, disciplina, tipo, nota, em_ms)
  SELECT p.tenant_id, p.id, x->>'id',
         CASE WHEN x->>'data' ~ '^\d{4}-\d{2}-\d{2}$' THEN (x->>'data')::date END,
         CASE WHEN x->>'min' ~ '^\d+$' THEN (x->>'min')::int END,
         x->>'disc', x->>'tipo', x->>'nota',
         CASE WHEN x->>'em' ~ '^\d+$' THEN (x->>'em')::bigint END
    FROM public.simulado_cronograma_adaptativo_plano p
    CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(p.extras) = 'array' THEN p.extras ELSE '[]'::jsonb END) x
   WHERE jsonb_typeof(p.extras) = 'array'
     AND NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_extra e WHERE e.plano_id = p.id);

COMMENT ON TABLE public.simulado_cronograma_adaptativo_plano_horas IS 'Horas de estudo por dia da semana (0 = segunda) — vem de cfg.horas.';
COMMENT ON TABLE public.simulado_cronograma_adaptativo_plano_extra IS 'Sessões de estudo fora do cronograma — vem de plano.extras.';

NOTIFY pgrst, 'reload schema';
