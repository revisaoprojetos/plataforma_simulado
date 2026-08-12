-- Gamificação (estilo Duolingo p/ simulados): XP, níveis, ligas, streak, missões, conquistas.
--
-- Modelo: 1 linha de CONFIG (JSONB) por tenant + LEDGER imutável de eventos de XP (fonte da verdade)
-- + CACHE denormalizado por aluno (reconstruível do ledger) + desbloqueios/progresso normalizados.
--
-- Convenção student-scoped (igual simulado_respostas_avulsas): prefixo simulado_, tenant_id NOT NULL,
-- RLS LIGADO SEM policy (escrita/leitura só via service role no código, sempre filtrando por
-- tenant_id + estudante_id). Idempotência de award via UNIQUE(origem, ref_id) + ON CONFLICT.

-- ───────────────────────── CONFIG (1 linha por tenant, editável no admin) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.simulado_gamificacao_config (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL REFERENCES public.simulado_tenants(id) ON DELETE CASCADE,
  ativo          boolean NOT NULL DEFAULT false,             -- flag/toggle por tenant (rollout)
  timezone       text NOT NULL DEFAULT 'America/Sao_Paulo',  -- fronteira do "dia" p/ streak/missões
  xp_regras      jsonb NOT NULL DEFAULT '{}'::jsonb,         -- {simulado, pratica, streak, chest}
  nivel_curva    jsonb NOT NULL DEFAULT '{}'::jsonb,         -- {tipo, base, incremento}
  ligas          jsonb NOT NULL DEFAULT '[]'::jsonb,         -- [{id, nome, xp_min, cor}]
  missoes_def    jsonb NOT NULL DEFAULT '[]'::jsonb,         -- [{id, titulo, tipo, meta, xp}]
  conquistas_def jsonb NOT NULL DEFAULT '[]'::jsonb,         -- [{id, titulo, descricao, icone, regra, xp}]
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);
DROP TRIGGER IF EXISTS trg_gam_config_updated ON public.simulado_gamificacao_config;
CREATE TRIGGER trg_gam_config_updated BEFORE UPDATE ON public.simulado_gamificacao_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.simulado_gamificacao_config ENABLE ROW LEVEL SECURITY;

-- ───────────────────────── LEDGER de XP (imutável — fonte da verdade) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.simulado_xp_eventos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  origem        text NOT NULL,   -- 'simulado'|'pratica'|'streak'|'chest'|'missao'|'conquista'|'backfill'
  ref_id        text NOT NULL,   -- chave de dedupe (sessao_id, resposta_id, YYYY-MM-DD, missao:dia, ...)
  xp            integer NOT NULL,
  meta          jsonb,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
-- Idempotência: um mesmo (aluno, origem, ref) nunca pontua duas vezes (finalize manual + auto, retry, backfill).
CREATE UNIQUE INDEX IF NOT EXISTS idx_xp_dedup ON public.simulado_xp_eventos (tenant_id, estudante_id, origem, ref_id);
-- Somas por janela (XP da semana/mês) e histórico do aluno.
CREATE INDEX IF NOT EXISTS idx_xp_periodo ON public.simulado_xp_eventos (tenant_id, estudante_id, criado_em);
-- Leaderboard semanal/mensal (varredura tenant-wide por período).
CREATE INDEX IF NOT EXISTS idx_xp_tenant_periodo ON public.simulado_xp_eventos (tenant_id, criado_em);
ALTER TABLE public.simulado_xp_eventos ENABLE ROW LEVEL SECURITY;

-- ───────────────────────── CACHE por aluno (reconstruível do ledger) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.simulado_gamificacao_estudante (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  estudante_id     uuid NOT NULL,
  xp_total         integer NOT NULL DEFAULT 0,
  nivel            integer NOT NULL DEFAULT 1,
  liga             text NOT NULL DEFAULT 'bronze',
  streak_atual     integer NOT NULL DEFAULT 0,
  streak_maior     integer NOT NULL DEFAULT 0,
  ultimo_dia_ativo date,                       -- dia local (tz do tenant) da última atividade
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, estudante_id)
);
-- Leaderboard dentro do tier (por XP total) e ranking geral do tenant.
CREATE INDEX IF NOT EXISTS idx_gam_liga_xp ON public.simulado_gamificacao_estudante (tenant_id, liga, xp_total DESC);
CREATE INDEX IF NOT EXISTS idx_gam_tenant_xp ON public.simulado_gamificacao_estudante (tenant_id, xp_total DESC);
ALTER TABLE public.simulado_gamificacao_estudante ENABLE ROW LEVEL SECURITY;

-- ───────────────────────── Desbloqueios de CONQUISTAS (por aluno) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.simulado_conquista_desbloqueios (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  estudante_id    uuid NOT NULL,
  conquista_id    text NOT NULL,               -- casa com conquistas_def[].id
  desbloqueado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, estudante_id, conquista_id)
);
CREATE INDEX IF NOT EXISTS idx_conq_estudante ON public.simulado_conquista_desbloqueios (estudante_id);
ALTER TABLE public.simulado_conquista_desbloqueios ENABLE ROW LEVEL SECURITY;

-- ───────────────────────── Progresso de MISSÕES diárias (por aluno/dia) ─────────────────────────
CREATE TABLE IF NOT EXISTS public.simulado_missao_progresso (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  estudante_id    uuid NOT NULL,
  missao_id       text NOT NULL,               -- casa com missoes_def[].id
  dia             date NOT NULL,               -- a própria coluna É o reset diário (sem cron)
  progresso       integer NOT NULL DEFAULT 0,
  completa        boolean NOT NULL DEFAULT false,
  recompensa_dada boolean NOT NULL DEFAULT false,
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, estudante_id, missao_id, dia)
);
CREATE INDEX IF NOT EXISTS idx_missao_estudante_dia ON public.simulado_missao_progresso (estudante_id, dia);
ALTER TABLE public.simulado_missao_progresso ENABLE ROW LEVEL SECURITY;

-- ───────────────────────── RPC: total de XP de UM aluno (recompute autoritativo do cache) ─────────────────────────
CREATE OR REPLACE FUNCTION public.rpc_xp_total(p_tenant uuid, p_estudante uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(xp), 0)::bigint
  FROM public.simulado_xp_eventos
  WHERE tenant_id = p_tenant AND estudante_id = p_estudante
$$;

-- ───────────────────────── RPC: ranking de XP por período (leaderboard semana/mês) ─────────────────────────
-- Agrega o ledger numa janela derivada de now() — sem cron de reset. SECURITY DEFINER + filtro por tenant.
CREATE OR REPLACE FUNCTION public.rpc_xp_ranking_periodo(p_tenant uuid, p_desde timestamptz)
RETURNS TABLE (estudante_id uuid, xp bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT e.estudante_id, SUM(e.xp)::bigint AS xp
  FROM public.simulado_xp_eventos e
  WHERE e.tenant_id = p_tenant AND e.criado_em >= p_desde
  GROUP BY e.estudante_id
  ORDER BY xp DESC
$$;

-- ───────────────────────── SEED: 1 config por tenant (ativo=false), com defaults ─────────────────────────
INSERT INTO public.simulado_gamificacao_config (tenant_id, xp_regras, nivel_curva, ligas, missoes_def, conquistas_def)
SELECT t.id,
  '{"simulado":{"base":20,"por_acerto":2,"bonus_nota_max":30},"pratica":{"por_acerto":5,"bonus_disc_fraca":3},"streak":{"por_dia":10,"cap":50},"chest":{"cada_n_dias":7,"xp":100}}'::jsonb,
  '{"tipo":"formula","base":100,"incremento":40}'::jsonb,
  '[{"id":"bronze","nome":"Bronze","xp_min":0,"cor":"#a16207"},{"id":"prata","nome":"Prata","xp_min":500,"cor":"#94a3b8"},{"id":"ouro","nome":"Ouro","xp_min":1500,"cor":"#f59e0b"},{"id":"safira","nome":"Safira","xp_min":3000,"cor":"#0ea5e9"},{"id":"diamante","nome":"Diamante","xp_min":5000,"cor":"#8b5cf6"}]'::jsonb,
  '[{"id":"m_simulado","titulo":"Complete 1 simulado","tipo":"finalizar_simulado","meta":1,"xp":30},{"id":"m_acertos","titulo":"Acerte 20 questões","tipo":"acertar_n","meta":20,"xp":20},{"id":"m_pratica","titulo":"Pratique 10 questões","tipo":"praticar_n","meta":10,"xp":15}]'::jsonb,
  '[{"id":"c_primeiro","titulo":"Primeiro simulado","descricao":"Conclua seu primeiro simulado","icone":"rocket","regra":{"tipo":"simulados_concluidos","meta":1},"xp":20},{"id":"c_streak7","titulo":"Semana em chamas","descricao":"Mantenha 7 dias de sequência","icone":"flame","regra":{"tipo":"streak","meta":7},"xp":50},{"id":"c_1000xp","titulo":"1000 XP","descricao":"Acumule 1000 XP","icone":"zap","regra":{"tipo":"xp_total","meta":1000},"xp":0},{"id":"c_nota100","titulo":"Nota 100","descricao":"Tire 100 em um simulado","icone":"trophy","regra":{"tipo":"nota_max","meta":100},"xp":40},{"id":"c_maratona","titulo":"Maratonista","descricao":"Conclua 20 simulados","icone":"medal","regra":{"tipo":"simulados_concluidos","meta":20},"xp":60}]'::jsonb
FROM public.simulado_tenants t
ON CONFLICT (tenant_id) DO NOTHING;

-- NOTA DE BACKFILL: XP retroativo dos simulados já finalizados NÃO é feito aqui (1000+ alunos).
-- Rodar scripts/backfill-gamificacao.mjs <tenantId> off-peak (idempotente: refId=sessao_id).
