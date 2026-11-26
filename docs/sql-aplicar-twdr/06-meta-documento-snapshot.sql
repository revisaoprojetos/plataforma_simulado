-- =====================================================================================================================
-- 06-meta-documento-snapshot — colunas doc_titulo/doc_titulo_norm/doc_pasta_id + 3 índices parciais (origem 20261125020000, SEM a função e SEM backfill de plano_meta)
-- Projeto alvo: twdrtlxkjvunkdobudev (SQL Editor do Supabase). Cole numa ABA NOVA e rode inteiro (o Editor já usa transação).
-- Idempotente. Sem CONCURRENTLY/VACUUM. Risco: MÉDIO: ADD COLUMN nullable é instantâneo; 2 índices parciais em plano_meta (1,5 mi linhas/1,4 GB) levam segundos a ~1 min e bloqueiam ESCRITA em plano_meta; rode fora do pico
-- Ver LEIAME.md (ordem, verificação).
-- =====================================================================================================================
SET LOCAL lock_timeout = '15s';

-- LIGAÇÃO META ↔ DOCUMENTO POR ID **E** POR NOME (snapshot) — aditiva, idempotente, retrocompatível. NÃO aplicar sem revisão.
--
-- Por quê: a meta aponta para o documento por ID. Documento apagado (soft-delete)/recriado com id novo quebrava a ligação em silêncio.
-- Agora cada meta guarda também o TÍTULO, o título NORMALIZADO e a PASTA do documento no momento do espelho/definição, o que permite:
--   (a) reencontrar o documento recriado (relink seguro por nome — lib/cronograma/adaptativo/relink-documento.ts);
--   (b) mostrar 'Material indisponível — <título>' mesmo depois de o documento ser purgado da lixeira;
--   (c) diagnosticar divergência título-snapshot × título atual (rota admin /api/admin/cronogramas/ligacoes).
-- O código funciona COM e SEM estas colunas (detecta a ausência e segue). Rollback: DROP COLUMN das 3 colunas + restaurar a função de 20261110020000.
-- Pré-requisitos: 20261105050000 (plano_meta), 20261105070000 (meta_def), 20261110020000 (função de espelho).

ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta ADD COLUMN IF NOT EXISTS doc_titulo text;
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta ADD COLUMN IF NOT EXISTS doc_titulo_norm text;
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta ADD COLUMN IF NOT EXISTS doc_pasta_id uuid;
ALTER TABLE public.simulado_cronograma_adaptativo_meta_def   ADD COLUMN IF NOT EXISTS doc_titulo text;
ALTER TABLE public.simulado_cronograma_adaptativo_meta_def   ADD COLUMN IF NOT EXISTS doc_titulo_norm text;
ALTER TABLE public.simulado_cronograma_adaptativo_meta_def   ADD COLUMN IF NOT EXISTS doc_pasta_id uuid;

-- índices: documento_id (consulta 'quem usa este documento') e título normalizado (busca de substituto) — parciais, baratos
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_documento ON public.simulado_cronograma_adaptativo_plano_meta (documento_id) WHERE documento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cron_adapt_def_documento ON public.simulado_cronograma_adaptativo_meta_def (documento_id) WHERE documento_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cron_adapt_def_doc_titulo_norm ON public.simulado_cronograma_adaptativo_meta_def (tenant_id, doc_titulo_norm) WHERE doc_titulo_norm IS NOT NULL;

-- backfill SÓ de meta_def (996 linhas). O backfill de plano_meta (1,38 mi linhas com documento_id) foi REMOVIDO: reescreveria ~1,4 GB (bloat/disco 84%).
--   O snapshot de plano_meta é preenchido gradualmente pelo espelho (arquivo 07).
-- (original:) backfill do que já existe (o documento — mesmo deletado — ainda está na tabela até o purge de 30 dias). doc_titulo_norm é preenchido pelo app no próximo espelho.
UPDATE public.simulado_cronograma_adaptativo_meta_def d
   SET doc_titulo = x.titulo, doc_pasta_id = x.pasta_id
  FROM public.simulado_conteudo_documentos x
 WHERE d.documento_id = x.id AND d.doc_titulo IS NULL;

-- (função cron_adapt_espelhar_grade NÃO é redefinida aqui: ver 07-funcao-espelhar-grade-FINAL.sql, que mantém o diff IS DISTINCT de 20261203000001)

COMMENT ON COLUMN public.simulado_cronograma_adaptativo_plano_meta.doc_titulo IS 'Título do documento no momento do espelho (snapshot p/ relink e p/ exibir Material indisponível).';
COMMENT ON COLUMN public.simulado_cronograma_adaptativo_plano_meta.doc_titulo_norm IS 'Título normalizado (sem acentos/caixa/zeros/sufixos de cópia) — chave do relink por nome.';
COMMENT ON COLUMN public.simulado_cronograma_adaptativo_plano_meta.doc_pasta_id IS 'Pasta do documento no momento do espelho.';

INSERT INTO public.simulado_cronograma_adaptativo_schema (versao) VALUES ('20261125020000') ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
