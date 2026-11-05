-- CRONOGRAMA ADAPTATIVO — desmembra a GRADE (`plano.plano` JSON) em linhas de `simulado_cronograma_adaptativo_plano_meta`.
-- Preenche as colunas que dependem só do JSON: meta_id, tipo, tipo_nome, parte, semana, dia, data_prevista, horas, ordem.
-- (disciplina/aula/título/documento são completados pelo app — botão "Espelhar" no admin — que também mantém as linhas em dia.)
-- Pré-requisito: 20261105050000. Idempotente (não duplica; não sobrescreve o que o app já enriqueceu). Roda em ~1 minuto p/ ~325 mil itens.
-- Planos de exemplo ficam de fora.

INSERT INTO public.simulado_cronograma_adaptativo_plano_meta
  (tenant_id, estudante_id, plano_id, meta_id, tipo, tipo_nome, parte, semana, dia, data_prevista, horas, ordem)
SELECT t.tenant_id, t.estudante_id, t.plano_id, t.meta_id, t.tipo,
       CASE t.tipo WHEN 'pf' THEN 'PDFull' WHEN 'pp' THEN 'PDFull (parte)' WHEN 'fl' THEN 'PDFlash' WHEN 'qu' THEN 'Questões'
                   WHEN 'lp' THEN 'LegProc' WHEN 'rf' THEN 'Revisão PDFlash' WHEN 'rq' THEN 'Revisão Questões' END,
       t.parte,
       (((date_trunc('week', t.data)::date - date_trunc('week', t.inicio)::date) / 7) + 1)::int,
       (extract(isodow FROM t.data)::int - 1)::smallint,
       t.data, t.horas,
       (row_number() OVER (PARTITION BY t.plano_id, t.data
                           ORDER BY CASE t.tipo WHEN 'pp' THEN 0 WHEN 'pf' THEN 0 WHEN 'fl' THEN 1 WHEN 'qu' THEN 2 WHEN 'lp' THEN 3 ELSE 4 END, t.meta_id) - 1)::int
  FROM (
    SELECT p.tenant_id, p.estudante_id, p.id AS plano_id, e.key AS meta_id, split_part(e.key, ':', 1) AS tipo,
           CASE WHEN split_part(e.key, ':', 1) = 'pp' AND split_part(e.key, ':', 3) ~ '^\d+$' THEN split_part(e.key, ':', 3)::int END AS parte,
           (e.value->>0)::date AS data, (p.cfg->>'start')::date AS inicio,
           CASE WHEN jsonb_typeof(e.value->1) = 'number' THEN round((e.value->>1)::numeric, 2) END AS horas
      FROM public.simulado_cronograma_adaptativo_plano p
      CROSS JOIN LATERAL jsonb_each(CASE WHEN jsonb_typeof(p.plano) = 'object' THEN p.plano ELSE '{}'::jsonb END) e
     WHERE p.exemplo = false
       AND jsonb_typeof(p.plano) = 'object'
       AND jsonb_typeof(e.value) = 'array'
       AND e.value->>0 ~ '^\d{4}-\d{2}-\d{2}$'
       AND p.cfg->>'start' ~ '^\d{4}-\d{2}-\d{2}$'
       AND split_part(e.key, ':', 1) IN ('pf','pp','fl','qu','lp','rf','rq')
  ) t
ON CONFLICT (plano_id, meta_id) DO NOTHING;

NOTIFY pgrst, 'reload schema';
