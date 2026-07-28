-- ============================================================================
-- Fase 1c (reorg multitenant) — CONFIG GLOBAL DA ENTRADA (neutra)
-- Tira a config da ENTRADA (login) de dentro do tema por-tenant. Antes, o "shell"
-- neutro do login herdava a marca do PRIMEIRO tenant (preferência indevida por uma
-- plataforma). Agora a entrada tem marca/layout próprios, iguais para todas.
--
-- Linha única (id=1). Sem tenant_id — é global. RLS sem policy: só service role.
-- Os logos POR plataforma (cards de seleção) continuam no tema de cada tenant.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.simulado_config_global (
  id                 smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  login_layout       text NOT NULL DEFAULT 'painel',   -- painel | centralizado
  login_selecao      boolean NOT NULL DEFAULT true,    -- mostrar seletor de plataforma por padrão
  logo_filtro_login  text NOT NULL DEFAULT 'none',     -- none | branco | preto
  entrada_nome       text,                             -- título neutro da entrada
  entrada_logo_url   text,                             -- logo neutra (painel do login)
  entrada_cor        text,                             -- cor de destaque neutra
  entrada_modo       text NOT NULL DEFAULT 'light',    -- light | dark do shell de entrada
  atualizado_em      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.simulado_config_global ENABLE ROW LEVEL SECURITY;

-- Uma linha, com defaults neutros. O super-admin ajusta a marca neutra depois (1c-2).
INSERT INTO public.simulado_config_global (id) VALUES (1) ON CONFLICT (id) DO NOTHING;
