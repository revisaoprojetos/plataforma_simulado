-- Biblioteca de Conteúdos — modelo de acesso estilo Google Drive: PAPÉIS por pessoa/grupo
-- (reader/commenter/editor), ACESSO GERAL ("qualquer pessoa com o link" = todos / restrito) e
-- HERANÇA explícita por nó (herdar ou não do pai). Mantém a semântica canônica do app como base
-- (SEM atribuição = liberado a todos do tenant), com estas colunas refinando-a por nó.
--
-- Mapeamento ao protótipo card-pasta-drive(1).html:
--   node.people[].role  -> coluna `papel` nas 4 tabelas de atribuição (pasta/doc × grupos/estudantes)
--   node.inherit        -> `herda_acesso` (pasta/doc): herda pessoas+geral do pai
--   node.general.mode   -> `acesso_geral`: NULL = herda do pai; 'todos' = qualquer um com o link; 'restrito'
--   node.general.role   -> `acesso_geral_papel`
--
-- Interpretação do gate (lib/conteudo/leitor.ts) p/ um aluno ver um doc:
--   resolve, subindo a cadeia pai->filho, o acesso EFETIVO (pessoas/grupos + geral), respeitando
--   `herda_acesso` em cada nível. 'todos' libera a todos; 'restrito' limita à união de grupos/alunos.
--   Quando nenhuma coluna foi configurada (padrão), comporta-se como hoje: liberado a todos.

-- 1) Papel por atribuição (as 4 tabelas keyed por pasta_id / documento_id)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_pasta_grupos','simulado_pasta_estudantes',
    'simulado_conteudo_documento_grupos','simulado_conteudo_documento_estudantes'
  ] LOOP
    EXECUTE format($f$ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS papel text NOT NULL DEFAULT 'reader'$f$, t);
    EXECUTE format($f$ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I$f$, t, 'chk_' || t || '_papel');
    EXECUTE format($f$ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (papel IN ('reader','commenter','editor'))$f$, t, 'chk_' || t || '_papel');
  END LOOP;
END $$;

-- 2) Herança + acesso geral por nó (pastas de conteúdo e documentos)
--    (simulado_pastas é compartilhada com outras áreas; colunas aditivas com default não alteram o
--     comportamento das demais — os gates de leitura/juris as ignoram.)
ALTER TABLE public.simulado_pastas
  ADD COLUMN IF NOT EXISTS herda_acesso        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_geral        text,
  ADD COLUMN IF NOT EXISTS acesso_geral_papel  text NOT NULL DEFAULT 'reader';

ALTER TABLE public.simulado_conteudo_documentos
  ADD COLUMN IF NOT EXISTS herda_acesso        boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS acesso_geral        text,
  ADD COLUMN IF NOT EXISTS acesso_geral_papel  text NOT NULL DEFAULT 'reader';

DO $$
BEGIN
  ALTER TABLE public.simulado_pastas DROP CONSTRAINT IF EXISTS chk_pastas_acesso_geral;
  ALTER TABLE public.simulado_pastas ADD CONSTRAINT chk_pastas_acesso_geral
    CHECK (acesso_geral IS NULL OR acesso_geral IN ('restrito','todos'));
  ALTER TABLE public.simulado_pastas DROP CONSTRAINT IF EXISTS chk_pastas_acesso_geral_papel;
  ALTER TABLE public.simulado_pastas ADD CONSTRAINT chk_pastas_acesso_geral_papel
    CHECK (acesso_geral_papel IN ('reader','commenter','editor'));

  ALTER TABLE public.simulado_conteudo_documentos DROP CONSTRAINT IF EXISTS chk_cdoc_acesso_geral;
  ALTER TABLE public.simulado_conteudo_documentos ADD CONSTRAINT chk_cdoc_acesso_geral
    CHECK (acesso_geral IS NULL OR acesso_geral IN ('restrito','todos'));
  ALTER TABLE public.simulado_conteudo_documentos DROP CONSTRAINT IF EXISTS chk_cdoc_acesso_geral_papel;
  ALTER TABLE public.simulado_conteudo_documentos ADD CONSTRAINT chk_cdoc_acesso_geral_papel
    CHECK (acesso_geral_papel IN ('reader','commenter','editor'));
END $$;

NOTIFY pgrst, 'reload schema';
