-- CATÁLOGO DE TIPOS DE CONTEÚDO por tenant (Cronograma › Adaptativo › Conteúdo).
-- Tipos de SISTEMA (pdfull, pdfight, pdflash, legproc, jurisclub, questoes) são estáticos no código; aqui ficam:
--   · tipos PERSONALIZADOS (sistema = false), criados pelo admin;
--   · OVERRIDES de rótulo/cor/duração/ordem/ativo de um tipo de sistema (sistema = true; papel/slug nunca mudam).
-- `simulado_pastas.cronograma_tipo_material` é text SEM CHECK/enum (verificado em 20261029020000): já aceita qualquer slug.
-- Aditiva e idempotente. Aplicação manual no SQL Editor.

CREATE TABLE IF NOT EXISTS public.simulado_conteudo_tipos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  slug               text NOT NULL,
  nome               text NOT NULL,
  nome_aluno         text,
  cor                text,
  papel              text NOT NULL DEFAULT 'generico'
                     CHECK (papel IN ('leitura','apoio','lei_seca','jurisprudencia','questoes','generico')),
  duracao_padrao_min integer CHECK (duracao_padrao_min IS NULL OR (duracao_padrao_min BETWEEN 1 AND 600)),
  prioridade         integer NOT NULL DEFAULT 20,
  ordem              integer NOT NULL DEFAULT 100,
  ativo              boolean NOT NULL DEFAULT true,
  sistema            boolean NOT NULL DEFAULT false,
  descricao          text,
  versao             integer NOT NULL DEFAULT 1,
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simulado_conteudo_tipos_slug_chk CHECK (slug ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  CONSTRAINT simulado_conteudo_tipos_tenant_slug_uq UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_conteudo_tipos_tenant_ordem ON public.simulado_conteudo_tipos (tenant_id, ordem);

CREATE OR REPLACE FUNCTION public.conteudo_tipos_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_conteudo_tipos_atualizado ON public.simulado_conteudo_tipos;
CREATE TRIGGER trg_conteudo_tipos_atualizado BEFORE UPDATE ON public.simulado_conteudo_tipos
  FOR EACH ROW EXECUTE FUNCTION public.conteudo_tipos_touch();

ALTER TABLE public.simulado_conteudo_tipos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS simulado_conteudo_tipos_isolation ON public.simulado_conteudo_tipos;
CREATE POLICY simulado_conteudo_tipos_isolation ON public.simulado_conteudo_tipos
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulado_conteudo_tipos TO service_role;

-- Validação tolerante do slug na pasta (qualquer slug do formato; o catálogo é validado no app). Não apaga dados:
-- NOT VALID evita varrer/rejeitar linhas antigas; só vale para novas gravações.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulado_pastas_cron_tipo_slug_chk') THEN
    ALTER TABLE public.simulado_pastas ADD CONSTRAINT simulado_pastas_cron_tipo_slug_chk
      CHECK (cronograma_tipo_material IS NULL OR cronograma_tipo_material ~ '^[a-z0-9][a-z0-9_-]{1,39}$') NOT VALID;
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
