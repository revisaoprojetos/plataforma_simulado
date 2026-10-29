-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA ADAPTATIVO 2.0 — porte do modelo "método Revisão" (motor próprio)
--
-- Sistema PARALELO ao cronograma de catálogo. Aqui o plano NÃO vem de uma grade
-- fixa do admin: é CALCULADO pelo motor (lib/cronograma/adaptativo/engine.ts) a
-- partir da configuração do aluno (horas/dia, disciplinas, arranjo, ritmo de
-- leitura, revisão, recesso) sobre um catálogo de aulas (AS/WLP). Os ids de meta
-- são STRINGS derivadas do motor ('pf:12', 'fl:3', 'lp:5:1', 'rf:12:7'), por isso
-- NÃO reusam simulado_cronograma_meta_checks (que é uuid por meta de catálogo).
--
-- Duas tabelas:
--  · _plano  = 1 por aluno (o cronograma ativo). Guarda o CFG (o motor re-deriva a
--              grade a cada leitura, determinístico); pausa; semanas de revisão
--              congeladas (revs); flag exemplo.
--  · _meta   = progresso por meta (string): concluída/não-realizada/parcial, grau
--              de dificuldade (0–10), estrelas, acertos/erros de questões (res/err),
--              tempo de estudo (modo foco, em segundos), modo de revisão e anotação.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  titulo        text,
  -- CFG do motor: { start, horas[7], rotinas[], recessos[], discs[], metas{pf,fl,qu,lp,vd}, arranjo, revisao{ativa,cada}, vel, revModelo }
  cfg           jsonb NOT NULL,
  plano         jsonb NOT NULL DEFAULT '{}'::jsonb,    -- grade calculada { id: [dataISO, horas] } — persistida; só recalcula em gerar/recalcular
  fim           integer NOT NULL DEFAULT 1,           -- semana final calculada (cache leve)
  revs          jsonb NOT NULL DEFAULT '{}'::jsonb,    -- semanas de revisão congeladas { "<sem>": [[id,data],...] }
  pausa         jsonb,                                 -- { desde: 'YYYY-MM-DD' } ou null
  extras        jsonb NOT NULL DEFAULT '[]'::jsonb,    -- sessões de estudo fora do cronograma
  exemplo       boolean NOT NULL DEFAULT false,
  arquivada     boolean NOT NULL DEFAULT false,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  -- Um cronograma adaptativo ativo por aluno (o modelo é plano único).
  UNIQUE (tenant_id, estudante_id)
);

CREATE INDEX IF NOT EXISTS idx_cron_adapt_plano_est
  ON public.simulado_cronograma_adaptativo_plano (tenant_id, estudante_id);

CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_meta (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  plano_id      uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  meta_id       text NOT NULL,                         -- id do motor: 'pf:12', 'qu:3', 'lp:5:1', 'rf:12:7'...
  estado        text CHECK (estado IN ('done','missed')),
  parcial_v     text,                                  -- "parei no art. X" (texto/numero)
  parcial_em    date,
  grau          smallint CHECK (grau BETWEEN 0 AND 10),-- dificuldade do tema (ancorada na meta pf:i)
  estrelas      smallint CHECK (estrelas BETWEEN 0 AND 5),
  res           integer,                               -- questões resolvidas
  err           integer,                               -- questões erradas
  tempo_seg     integer NOT NULL DEFAULT 0,            -- tempo de estudo acumulado (modo foco)
  modo          text,                                  -- modo de revisão (pdflash/flashcard/grifos)
  nota          text,                                  -- anotação livre
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plano_id, meta_id)
);

CREATE INDEX IF NOT EXISTS idx_cron_adapt_meta_plano
  ON public.simulado_cronograma_adaptativo_meta (tenant_id, plano_id);

-- RLS por tenant (path autenticado; o aluno acessa via service role, que bypassa).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_cronograma_adaptativo_plano','simulado_cronograma_adaptativo_meta'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
    EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
      USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
