-- Biblioteca de Conteúdos — Acesso v2 (FUNDAÇÃO do ecossistema de acesso/visibilidade).
-- Traduz o algoritmo de "acesso efetivo" do handoff (§3/§4) para colunas, de forma 100% ADITIVA:
-- modos de acesso por nó (principal/herdar/propria/bloquear), visibilidade (oculto) e, por
-- atribuição, a ORIGEM (avulsa/individual) + o trio de permissões (pode_ler/pode_baixar/pode_grifar).
--
-- GARANTIA DE NÃO-REGRESSÃO: os defaults são escolhidos para que o ACESSO EFETIVO fique IDÊNTICO ao
-- de hoje enquanto a UI não mexer. O gate atual (lib/conteudo/leitor.ts) NÃO lê estas colunas novas,
-- então ele segue funcionando sem alteração; estas colunas só passam a valer quando o novo módulo
-- lib/conteudo/acesso-efetivo.ts for religado (feito depois, com cuidado).
--
-- Por que os defaults preservam o comportamento atual:
--   • oculto=false              -> hoje não existe visibilidade; tudo é visível. false = mesmo efeito.
--   • modo_acesso (pasta): raiz='principal', subpasta='herdar'.
--       O gate atual exige que o NÍVEL libere E (se herda_acesso<>false) o PAI libere, subindo a árvore.
--       Um nó NÃO configurado não tem atribuições e acesso_geral=null, então nivelLibera()=TRUE p/ ele;
--       logo o AND(self, pai) colapsa em "o pai decide" == exatamente a semântica 'herdar'. A raiz não
--       tem pai e decide por si == 'principal'. Assim o default reproduz o blend atual bit a bit.
--   • modo_acesso (doc)='herdar': idem — doc não configurado segue a pasta (como hoje: nivelLibera(doc)
--       sempre TRUE sem linhas, e pastaAcessivel() decide).
--   • origem='avulsa': a origem só rotula a entrega; não altera quem passa no gate. Default neutro.
--   • pode_ler=true / pode_grifar=true: hoje toda entrega que passa libera ler/grifar (controlado pelos
--       toggles por-documento). true = mesmo efeito. (pode_baixar já existe desde 20261024000000.)

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 1) PASTAS: modo de acesso + visibilidade
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.simulado_pastas
  ADD COLUMN IF NOT EXISTS modo_acesso text,
  ADD COLUMN IF NOT EXISTS oculto      boolean NOT NULL DEFAULT false;

-- Backfill idempotente SÓ onde ainda não definido e SÓ nas áreas de conteúdo (simulado_pastas é
-- compartilhada com outras áreas; fora de conteúdo o módulo nunca lê modo_acesso).
UPDATE public.simulado_pastas
   SET modo_acesso = CASE WHEN pai_id IS NULL THEN 'principal' ELSE 'herdar' END
 WHERE modo_acesso IS NULL
   AND folder_area IN ('conteudo','conteudo_modelo');

-- Novas pastas sem valor explícito caem em 'herdar' (a raiz é tratada como 'principal' também no módulo).
ALTER TABLE public.simulado_pastas ALTER COLUMN modo_acesso SET DEFAULT 'herdar';

DO $$
BEGIN
  ALTER TABLE public.simulado_pastas DROP CONSTRAINT IF EXISTS chk_pastas_modo_acesso;
  ALTER TABLE public.simulado_pastas ADD CONSTRAINT chk_pastas_modo_acesso
    CHECK (modo_acesso IS NULL OR modo_acesso IN ('principal','herdar','propria','bloquear'));
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 2) DOCUMENTOS: modo de acesso (segue a pasta por padrão) + visibilidade
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.simulado_conteudo_documentos
  ADD COLUMN IF NOT EXISTS modo_acesso text NOT NULL DEFAULT 'herdar',
  ADD COLUMN IF NOT EXISTS oculto      boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  ALTER TABLE public.simulado_conteudo_documentos DROP CONSTRAINT IF EXISTS chk_cdoc_modo_acesso;
  ALTER TABLE public.simulado_conteudo_documentos ADD CONSTRAINT chk_cdoc_modo_acesso
    CHECK (modo_acesso IN ('principal','herdar','propria','bloquear'));
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 3) ATRIBUIÇÕES (4 tabelas pasta/doc × grupos/estudantes): origem + permissões ler/grifar
--    (pode_baixar e liberado_de/liberado_ate já existem desde 20261024000000 — NÃO duplicar.)
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_pasta_grupos','simulado_pasta_estudantes',
    'simulado_conteudo_documento_grupos','simulado_conteudo_documento_estudantes'
  ] LOOP
    EXECUTE format($f$ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'avulsa'$f$, t);
    EXECUTE format($f$ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS pode_ler    boolean NOT NULL DEFAULT true$f$, t);
    EXECUTE format($f$ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS pode_grifar boolean NOT NULL DEFAULT true$f$, t);
    EXECUTE format($f$ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I$f$, t, 'chk_' || t || '_origem');
    EXECUTE format($f$ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (origem IN ('avulsa','individual'))$f$, t, 'chk_' || t || '_origem');
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────────
-- 4) TIPOS NOVOS: ampliar o CHECK de `tipo_origem` para aceitar pptx/xlsx/video/audio.
--    OBRIGATÓRIO — sem isto o INSERT desses tipos é rejeitado pelo Postgres (habilitados na ingestão).
--    Localiza e remove qualquer CHECK atual que referencie `tipo_origem` (nome desconhecido) e recria.
-- ─────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.simulado_conteudo_documentos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo_origem%'
  LOOP
    EXECUTE format('ALTER TABLE public.simulado_conteudo_documentos DROP CONSTRAINT %I', c.conname);
  END LOOP;
  ALTER TABLE public.simulado_conteudo_documentos
    ADD CONSTRAINT chk_cdoc_tipo_origem
    CHECK (tipo_origem IS NULL OR tipo_origem IN ('docx','pdf','html','pptx','xlsx','video','audio'));
END $$;

-- RLS das 4 tabelas + pastas/documentos já existe (não recriar aqui).

-- APÓS APLICAR: rodar `NOTIFY pgrst, 'reload schema';` (PostgREST) para o schema cache enxergar as
-- novas colunas. (Deixado fora do corpo transacional de propósito — lembrete operacional.)
-- NOTIFY pgrst, 'reload schema';
