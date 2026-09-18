-- ═══════════════════════════════════════════════════════════════════════════
-- Gamificação — PÚBLICO personalizado: em vez de ligar para TODOS, o admin pode
-- escolher QUAIS alunos participam (por grupo — conexão viva — e/ou avulsos),
-- no mesmo modelo dos "Acessos" do módulo.
--   publico_modo = 'todos' (padrão, comportamento antigo) | 'selecionados'
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.simulado_gamificacao_config
  ADD COLUMN IF NOT EXISTS publico_modo text NOT NULL DEFAULT 'todos';

CREATE TABLE IF NOT EXISTS public.simulado_gamificacao_grupos (
  tenant_id  uuid NOT NULL,
  grupo_id   uuid NOT NULL,
  criado_em  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, grupo_id)
);
CREATE TABLE IF NOT EXISTS public.simulado_gamificacao_estudantes (
  tenant_id    uuid NOT NULL,
  estudante_id uuid NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, estudante_id)
);
CREATE INDEX IF NOT EXISTS idx_gam_pub_grupos ON public.simulado_gamificacao_grupos(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gam_pub_est ON public.simulado_gamificacao_estudantes(tenant_id, estudante_id);

-- RLS habilitado sem policies (mesmo padrão das demais tabelas de gamificação: acesso via service role).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_gamificacao_grupos','simulado_gamificacao_estudantes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
