-- ═══════════════════════════════════════════════════════════════════════════
-- Área de LEITURA — Fase 1b: ANOTAÇÕES (grifos/notas) sobre o texto.
--
-- Âncora por TRECHO de texto: offsets de caractere sobre a "espinha" (concatenação
-- dos text nodes do HTML) + fallback text-quote {exact, prefix, suffix}. Presa à
-- versão do documento (re-upload troca a versão).
--
-- 2 tabelas:
--  • _anotacoes_base: templates do ADMIN (pré-definidas; vêm no documento).
--  • _leitura_anotacoes: por ALUNO (próprias + CLONES das base). O aluno pode
--    editar/apagar qualquer uma sem afetar os outros. Clone idempotente por
--    (estudante, versão, base_id) → base apagada pelo aluno não ressuscita.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_documento_anotacoes_base (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  documento_id     uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  documento_versao integer NOT NULL,
  inicio_char      integer NOT NULL,
  fim_char         integer NOT NULL,
  exact            text NOT NULL,          -- trecho selecionado (validação/recuperação)
  prefix           text,                   -- contexto antes (text-quote)
  suffix           text,                   -- contexto depois
  cor              text NOT NULL DEFAULT '#fde047',
  nota             text,
  ordem            integer,
  deletado         boolean NOT NULL DEFAULT false,
  criado_em        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_simulado_doc_anot_base_doc ON public.simulado_documento_anotacoes_base(documento_id, documento_versao);

CREATE TABLE IF NOT EXISTS public.simulado_leitura_anotacoes (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id        uuid NOT NULL,
  estudante_id     uuid NOT NULL,
  documento_id     uuid NOT NULL REFERENCES public.simulado_documentos(id) ON DELETE CASCADE,
  documento_versao integer NOT NULL,
  inicio_char      integer NOT NULL,
  fim_char         integer NOT NULL,
  exact            text NOT NULL,
  prefix           text,
  suffix           text,
  cor              text NOT NULL DEFAULT '#fde047',
  nota             text,
  origem           text NOT NULL DEFAULT 'propria', -- propria | base
  base_id          uuid,                   -- id do template quando origem='base'
  deletado         boolean NOT NULL DEFAULT false,
  criado_em        timestamptz NOT NULL DEFAULT now(),
  atualizado_em    timestamptz NOT NULL DEFAULT now(),
  -- Clone idempotente: NULLs são distintos no Postgres → próprias (base_id NULL) não colidem.
  UNIQUE (estudante_id, documento_versao, base_id)
);
CREATE INDEX IF NOT EXISTS idx_simulado_leitura_anot_est ON public.simulado_leitura_anotacoes(estudante_id, documento_id, documento_versao);

-- RLS por tenant (mesmo padrão simulado_*)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_documento_anotacoes_base','simulado_leitura_anotacoes'] LOOP
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
