-- PARTES de documento + CLASSIFICAÇÃO + SELEÇÃO POR META (camada de preferência) — Biblioteca/Cronograma.
-- ADITIVA e idempotente: não altera nem remove nada existente; colunas novas nascem NULL/default = comportamento atual.
-- Aplicação manual no SQL Editor (sem CONCURRENTLY/VACUUM).

-- 1) Partes de um documento (intervalo de trechos por uid estável; sem FK dura para trechos).
CREATE TABLE IF NOT EXISTS public.simulado_conteudo_partes (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  documento_id     uuid NOT NULL REFERENCES public.simulado_conteudo_documentos(id) ON DELETE RESTRICT,
  nome             text NOT NULL,
  ordem            integer NOT NULL DEFAULT 0,
  trecho_ini_uid   text NOT NULL,
  trecho_fim_uid   text NOT NULL,
  rotulo_ini       text,
  rotulo_fim       text,
  arquivada        boolean NOT NULL DEFAULT false,
  criado_por       uuid,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_conteudo_partes_doc_ordem ON public.simulado_conteudo_partes (tenant_id, documento_id, ordem);
-- uma parte ativa por (documento, nome)
CREATE UNIQUE INDEX IF NOT EXISTS uq_conteudo_partes_doc_nome_ativa
  ON public.simulado_conteudo_partes (tenant_id, documento_id, lower(nome)) WHERE NOT arquivada;
-- FK sem índice (documento_id já é prefixo do índice acima só com tenant_id antes) -> índice próprio p/ checagem do RESTRICT
CREATE INDEX IF NOT EXISTS idx_conteudo_partes_documento ON public.simulado_conteudo_partes (documento_id);

CREATE OR REPLACE FUNCTION public.conteudo_partes_touch() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.atualizado_em := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_conteudo_partes_atualizado ON public.simulado_conteudo_partes;
CREATE TRIGGER trg_conteudo_partes_atualizado BEFORE UPDATE ON public.simulado_conteudo_partes
  FOR EACH ROW EXECUTE FUNCTION public.conteudo_partes_touch();

ALTER TABLE public.simulado_conteudo_partes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS simulado_conteudo_partes_isolation ON public.simulado_conteudo_partes;
CREATE POLICY simulado_conteudo_partes_isolation ON public.simulado_conteudo_partes
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulado_conteudo_partes TO service_role;
COMMENT ON TABLE public.simulado_conteudo_partes IS 'Partes de um documento da Biblioteca: intervalo [trecho_ini_uid..trecho_fim_uid] (uids estáveis de simulado_conteudo_trechos, sem FK dura).';

-- 2) Documento: classificação própria e formato de leitura (NULL = herda da pasta, como hoje).
ALTER TABLE public.simulado_conteudo_documentos
  ADD COLUMN IF NOT EXISTS classificacao_id uuid NULL,
  ADD COLUMN IF NOT EXISTS formato_leitura text NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulado_conteudo_documentos_classificacao_fk') THEN
    ALTER TABLE public.simulado_conteudo_documentos
      ADD CONSTRAINT simulado_conteudo_documentos_classificacao_fk
      FOREIGN KEY (classificacao_id) REFERENCES public.simulado_conteudo_tipos(id) ON DELETE SET NULL NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulado_conteudo_documentos_formato_leitura_chk') THEN
    ALTER TABLE public.simulado_conteudo_documentos
      ADD CONSTRAINT simulado_conteudo_documentos_formato_leitura_chk
      CHECK (formato_leitura IS NULL OR formato_leitura ~ '^[a-z0-9][a-z0-9_-]{1,39}$') NOT VALID;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_conteudo_documentos_classificacao
  ON public.simulado_conteudo_documentos (classificacao_id) WHERE classificacao_id IS NOT NULL;

-- 3) Seleção por meta (preferência; 1 linha por tenant+área+meta).
CREATE TABLE IF NOT EXISTS public.simulado_conteudo_selecao_meta (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  area            text NOT NULL,
  meta_chave      text NOT NULL,
  documento_id    uuid NOT NULL REFERENCES public.simulado_conteudo_documentos(id) ON DELETE RESTRICT,
  parte_id        uuid NULL REFERENCES public.simulado_conteudo_partes(id) ON DELETE RESTRICT,
  classificacao_id uuid NULL,
  rotulo_aluno    text NULL,
  visivel_aluno   boolean NOT NULL DEFAULT true,
  ordem           integer NULL,
  regras_override jsonb NOT NULL DEFAULT '{}'::jsonb,  -- sobrescreve as regras de uso (área × classificação) só nesta meta
  extra           jsonb NOT NULL DEFAULT '{}'::jsonb,
  doc_titulo      text,
  doc_titulo_norm text,
  doc_pasta_id    uuid,
  criado_por      uuid,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simulado_conteudo_selecao_meta_uq UNIQUE (tenant_id, area, meta_chave)
);
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'simulado_conteudo_selecao_meta_classificacao_fk') THEN
    ALTER TABLE public.simulado_conteudo_selecao_meta
      ADD CONSTRAINT simulado_conteudo_selecao_meta_classificacao_fk
      FOREIGN KEY (classificacao_id) REFERENCES public.simulado_conteudo_tipos(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_conteudo_selecao_meta_documento ON public.simulado_conteudo_selecao_meta (documento_id);
CREATE INDEX IF NOT EXISTS idx_conteudo_selecao_meta_parte ON public.simulado_conteudo_selecao_meta (parte_id) WHERE parte_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conteudo_selecao_meta_doc_titulo_norm
  ON public.simulado_conteudo_selecao_meta (tenant_id, doc_titulo_norm) WHERE doc_titulo_norm IS NOT NULL;

DROP TRIGGER IF EXISTS trg_conteudo_selecao_meta_atualizado ON public.simulado_conteudo_selecao_meta;
CREATE TRIGGER trg_conteudo_selecao_meta_atualizado BEFORE UPDATE ON public.simulado_conteudo_selecao_meta
  FOR EACH ROW EXECUTE FUNCTION public.conteudo_partes_touch();

ALTER TABLE public.simulado_conteudo_selecao_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS simulado_conteudo_selecao_meta_isolation ON public.simulado_conteudo_selecao_meta;
CREATE POLICY simulado_conteudo_selecao_meta_isolation ON public.simulado_conteudo_selecao_meta
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulado_conteudo_selecao_meta TO service_role;
COMMENT ON TABLE public.simulado_conteudo_selecao_meta IS 'Seleção de conteúdo por meta (área + meta_chave): documento/parte/classificação preferidos, rótulo e visibilidade ao aluno. Snapshots doc_* p/ relink.';

-- 4) Classificação = identidade + EXIBIÇÃO (formato, índice, legenda...). Tempo/meta NÃO moram aqui.
ALTER TABLE public.simulado_conteudo_tipos
  ADD COLUMN IF NOT EXISTS exibicao jsonb NOT NULL DEFAULT '{}'::jsonb;

-- 5) Regras de USO por área × classificação (tempo, gera meta, qtd/semana, liberação...). Definidas na matriz de cada área.
--    Cascata: seleção por meta (regras_override) > regras de uso (área × classificação) > padrão do motor da área.
CREATE TABLE IF NOT EXISTS public.simulado_conteudo_regras_uso (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL,
  area             text NOT NULL,
  classificacao_id uuid NOT NULL REFERENCES public.simulado_conteudo_tipos(id) ON DELETE CASCADE,
  regras           jsonb NOT NULL DEFAULT '{}'::jsonb,
  versao           integer NOT NULL DEFAULT 1,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT simulado_conteudo_regras_uso_uq UNIQUE (tenant_id, area, classificacao_id)
);
CREATE INDEX IF NOT EXISTS idx_conteudo_regras_uso_class ON public.simulado_conteudo_regras_uso (classificacao_id);
DROP TRIGGER IF EXISTS trg_conteudo_regras_uso_atualizado ON public.simulado_conteudo_regras_uso;
CREATE TRIGGER trg_conteudo_regras_uso_atualizado BEFORE UPDATE ON public.simulado_conteudo_regras_uso
  FOR EACH ROW EXECUTE FUNCTION public.conteudo_partes_touch();
ALTER TABLE public.simulado_conteudo_regras_uso ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS simulado_conteudo_regras_uso_isolation ON public.simulado_conteudo_regras_uso;
CREATE POLICY simulado_conteudo_regras_uso_isolation ON public.simulado_conteudo_regras_uso
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.simulado_conteudo_regras_uso TO service_role;

NOTIFY pgrst, 'reload schema';
