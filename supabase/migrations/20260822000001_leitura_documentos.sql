-- ═══════════════════════════════════════════════════════════════════════════
-- Área de LEITURA — Fase 1a: documentos (HTML), conteúdo versionado e progresso.
--
-- Uma biblioteca de documentos (leis/materiais) que o aluno lê num leitor estilo
-- Kindle. O documento é enviado em HTML, SANITIZADO no servidor e guardado
-- versionado. O agrupamento/atribuição reusa simulado_pastas (folder_area='leitura')
-- + simulado_pasta_estudantes / simulado_pasta_grupos (sem tabelas novas de gate).
--
-- Padrão das demais simulado_*: tenant_id, deletado (soft-delete), RLS por tenant.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Catálogo / card do documento ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.simulado_documentos (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  pasta_id          uuid,                       -- simulado_pastas (folder_area='leitura'); null = raiz
  titulo            text NOT NULL,
  descricao         text,
  cor               text,                       -- cor do card (degradê)
  icone             text,                       -- nome do ícone (lib banco-visual)
  capa_url          text,                       -- capa do card
  arquivo_id        uuid,                       -- original enviado (simulado_arquivos), p/ reprocessar
  versao            integer NOT NULL DEFAULT 1, -- aponta a versão vigente em simulado_documento_conteudos
  publicado         boolean NOT NULL DEFAULT false,
  desafio_ativo     boolean NOT NULL DEFAULT true,   -- rastrear conclusão ("cumpriu o desafio")
  desafio_exige_fim boolean NOT NULL DEFAULT true,   -- exige cobertura 100% antes de concluir
  desafio_tempo_min integer,                    -- tempo mínimo de leitura (min) antes de concluir; null = 0
  criado_por        uuid,
  deletado          boolean NOT NULL DEFAULT false,
  criado_em         timestamptz NOT NULL DEFAULT now(),
  atualizado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_simulado_documentos_tenant ON public.simulado_documentos(tenant_id, deletado);
CREATE INDEX IF NOT EXISTS idx_simulado_documentos_pasta  ON public.simulado_documentos(pasta_id);

-- 2) Conteúdo HTML sanitizado, versionado ---------------------------------------
CREATE TABLE IF NOT EXISTS public.simulado_documento_conteudos (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  documento_id  uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  versao        integer NOT NULL,
  html          text NOT NULL,                  -- HTML já sanitizado (allowlist) + âncoras de artigo
  texto_hash    text,                           -- sha da "espinha" de texto (valida âncoras de anotação)
  artigos       integer NOT NULL DEFAULT 0,     -- nº de artigos/seções detectados (progresso/índice)
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, versao)                 -- upsert idempotente por versão
);
CREATE INDEX IF NOT EXISTS idx_simulado_doc_conteudos_doc ON public.simulado_documento_conteudos(documento_id);

-- 5) Progresso / conclusão da leitura por aluno ---------------------------------
CREATE TABLE IF NOT EXISTS public.simulado_leitura_progresso (
  id                uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id         uuid NOT NULL,
  estudante_id      uuid NOT NULL,
  documento_id      uuid NOT NULL,
  documento_versao  integer NOT NULL,
  pct               integer NOT NULL DEFAULT 0,  -- 0..100 (máximo alcançado)
  artigo_max        integer,                     -- artigo mais distante alcançado
  tempo_seg         integer NOT NULL DEFAULT 0,  -- tempo acumulado de leitura
  iniciado_em       timestamptz NOT NULL DEFAULT now(),
  concluido_em      timestamptz,                 -- setado ao cumprir o desafio
  atualizado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estudante_id, documento_id, documento_versao)  -- alvo do onConflict
);
CREATE INDEX IF NOT EXISTS idx_simulado_leitura_prog_doc ON public.simulado_leitura_progresso(documento_id);
CREATE INDEX IF NOT EXISTS idx_simulado_leitura_prog_est ON public.simulado_leitura_progresso(estudante_id);

-- 5b) Atribuição (opcional) — a QUEM o documento é liberado. -------------------
-- Regra de visibilidade: SEM nenhuma atribuição = liberado a todos os alunos do
-- tenant; COM atribuição = só grupos/estudantes atribuídos. (Espelha o gate de banco,
-- mas em tabelas próprias p/ não misturar ids de documento com pasta_estudantes.)
CREATE TABLE IF NOT EXISTS public.simulado_documento_grupos (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  documento_id uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  grupo_id     uuid NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, grupo_id)
);
CREATE INDEX IF NOT EXISTS idx_simulado_doc_grupos_doc ON public.simulado_documento_grupos(documento_id);

CREATE TABLE IF NOT EXISTS public.simulado_documento_estudantes (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id    uuid NOT NULL,
  documento_id uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  estudante_id uuid NOT NULL,
  criado_em    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (documento_id, estudante_id)
);
CREATE INDEX IF NOT EXISTS idx_simulado_doc_estudantes_doc ON public.simulado_documento_estudantes(documento_id);
CREATE INDEX IF NOT EXISTS idx_simulado_doc_estudantes_est ON public.simulado_documento_estudantes(estudante_id);

-- RLS por tenant (mesmo padrão simulado_*) --------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_documentos','simulado_documento_conteudos','simulado_leitura_progresso','simulado_documento_grupos','simulado_documento_estudantes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "tenant_isolation_%s" ON public.%I FOR ALL TO authenticated
      USING (tenant_id IN (SELECT public.user_tenant_ids()))
      WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))', t, t);
    EXECUTE format('GRANT ALL ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
