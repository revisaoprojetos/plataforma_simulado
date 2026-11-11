-- Unificar › Termos da taxonomia (Biblioteca › Questões).
-- 1) simulado_termos_mesclagens: log de cada mesclagem / normalização em lote com o ESTADO ANTERIOR (ids das questões por variante,
--    linha completa da variante removida, filhos) → permite DESFAZER. Sem esta tabela a mesclagem funciona (e fica na auditoria),
--    só não há botão "Desfazer".
-- 2) simulado_termos_ignorados: grupos marcados como "São termos diferentes" (não voltam a ser sugeridos). Sem a tabela o app usa
--    localStorage do navegador como fallback.
-- Idempotente. Aplicação manual no SQL Editor. O acesso é só pelo servidor (service role / conexão direta) — RLS ligada sem políticas.

CREATE TABLE IF NOT EXISTS public.simulado_termos_mesclagens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  tipo          text NOT NULL,                      -- disciplina | assunto | banca | orgao | cargo | assunto_detalhe
  origem        text NOT NULL DEFAULT 'mesclagem',  -- mesclagem | normalizacao
  canonica_id   text,
  canonica_nome text,
  nome_final    text,
  payload       jsonb NOT NULL DEFAULT '{}'::jsonb, -- { canonica:{…}, variantes:[{id,nome,row,questoes:[uuid],filhos:[uuid],removida,destino}] }
  questoes      int  NOT NULL DEFAULT 0,
  criado_por    uuid,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  desfeita      boolean NOT NULL DEFAULT false,
  desfeita_em   timestamptz,
  desfeita_por  uuid
);
CREATE INDEX IF NOT EXISTS idx_termos_mesclagens_tenant ON public.simulado_termos_mesclagens (tenant_id, criado_em DESC);
ALTER TABLE public.simulado_termos_mesclagens ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.simulado_termos_ignorados (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL,
  tipo        text NOT NULL,
  chave       text NOT NULL,        -- hash estável dos nomes normalizados do grupo
  nomes       text[] NOT NULL DEFAULT '{}',
  criado_por  uuid,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo, chave)
);
ALTER TABLE public.simulado_termos_ignorados ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
