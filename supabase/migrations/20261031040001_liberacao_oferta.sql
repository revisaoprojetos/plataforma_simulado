-- Estúdio de Conteúdo · Acesso & Comercial
-- OFERTA FINA (decidido): uma "oferta" é uma REGRA DE LIBERAÇÃO (simulado_liberacao_regras) que
-- AGRUPA produtos para liberação, marcada por `oferta = true`. SEM preço/checkout/cupom.
-- Reusa 100% das tabelas de liberação (regras + regra_produtos + access_grants); as telas de Oferta
-- apenas FILTRAM por este flag. O admin de Regras (/admin/liberacao) continua mostrando ambas.
--
-- Idempotente e tolerante: só roda se a tabela de regras já existir (migração de liberação aplicada —
-- 20261030000001_liberacao_regras). Em ambiente sem ela, as telas de Oferta degradam para vazio.
-- NÃO aplicar automaticamente: rodar pelo usuário + NOTIFY pgrst.
DO $$
BEGIN
  IF to_regclass('public.simulado_liberacao_regras') IS NOT NULL THEN
    ALTER TABLE public.simulado_liberacao_regras
      ADD COLUMN IF NOT EXISTS oferta boolean NOT NULL DEFAULT false;
    ALTER TABLE public.simulado_liberacao_regras
      ADD COLUMN IF NOT EXISTS descricao text;

    COMMENT ON COLUMN public.simulado_liberacao_regras.oferta IS
      'true = regra criada como "Oferta" no Estúdio (agrupamento fino de produtos p/ liberação). As telas de Oferta filtram por este flag.';

    CREATE INDEX IF NOT EXISTS idx_liberacao_regras_oferta
      ON public.simulado_liberacao_regras (tenant_id, oferta)
      WHERE oferta = true;
  END IF;
END $$;
