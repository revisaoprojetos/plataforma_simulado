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

-- backfill do que já existe (o documento — mesmo deletado — ainda está na tabela até o purge de 30 dias). doc_titulo_norm é preenchido pelo app no próximo espelho.
UPDATE public.simulado_cronograma_adaptativo_meta_def d
   SET doc_titulo = x.titulo, doc_pasta_id = x.pasta_id
  FROM public.simulado_conteudo_documentos x
 WHERE d.documento_id = x.id AND d.doc_titulo IS NULL;
UPDATE public.simulado_cronograma_adaptativo_plano_meta pm
   SET doc_titulo = x.titulo, doc_pasta_id = x.pasta_id
  FROM public.simulado_conteudo_documentos x
 WHERE pm.documento_id = x.id AND pm.doc_titulo IS NULL;

-- Espelho transacional: passa a gravar o snapshot (mesma assinatura/ownership; payload sem os campos novos continua válido → NULL preserva o anterior)
CREATE OR REPLACE FUNCTION public.cron_adapt_espelhar_grade(p_plano uuid, p_linhas jsonb) RETURNS integer
LANGUAGE plpgsql AS $$
DECLARE n integer;
BEGIN
  DELETE FROM public.simulado_cronograma_adaptativo_plano_meta pm
   WHERE pm.plano_id = p_plano
     AND pm.meta_id NOT IN (SELECT r.meta_id FROM jsonb_to_recordset(p_linhas) AS r(meta_id text));
  INSERT INTO public.simulado_cronograma_adaptativo_plano_meta AS pm
        (tenant_id, estudante_id, plano_id, meta_id, tipo, tipo_nome, parte, disciplina, aula, titulo, documento_id, aula_key,
         semana, dia, data_prevista, horas, ordem, detalhes, semana_origem, doc_titulo, doc_titulo_norm, doc_pasta_id, atualizado_em)
  SELECT r.tenant_id, r.estudante_id, p_plano, r.meta_id, r.tipo, r.tipo_nome, r.parte, r.disciplina, r.aula, r.titulo, r.documento_id, r.aula_key,
         r.semana, r.dia, r.data_prevista, r.horas, r.ordem, r.detalhes, r.semana_origem, r.doc_titulo, r.doc_titulo_norm, r.doc_pasta_id, now()
    FROM jsonb_to_recordset(p_linhas) AS r(tenant_id uuid, estudante_id uuid, meta_id text, tipo text, tipo_nome text, parte integer,
         disciplina text, aula text, titulo text, documento_id uuid, aula_key text, semana integer, dia integer,
         data_prevista date, horas numeric, ordem integer, detalhes jsonb, semana_origem integer,
         doc_titulo text, doc_titulo_norm text, doc_pasta_id uuid)
  ON CONFLICT (plano_id, meta_id) DO UPDATE SET
         tipo = EXCLUDED.tipo, tipo_nome = EXCLUDED.tipo_nome, parte = EXCLUDED.parte, disciplina = EXCLUDED.disciplina,
         aula = EXCLUDED.aula, titulo = EXCLUDED.titulo, documento_id = EXCLUDED.documento_id, aula_key = EXCLUDED.aula_key,
         semana = EXCLUDED.semana, dia = EXCLUDED.dia, data_prevista = EXCLUDED.data_prevista, horas = EXCLUDED.horas,
         ordem = EXCLUDED.ordem, detalhes = EXCLUDED.detalhes, semana_origem = EXCLUDED.semana_origem,
         -- snapshot: só sobrescreve quando a linha nova traz o nome (documento apagado/purgado NÃO apaga o último nome conhecido)
         doc_titulo = COALESCE(EXCLUDED.doc_titulo, pm.doc_titulo), doc_titulo_norm = COALESCE(EXCLUDED.doc_titulo_norm, pm.doc_titulo_norm),
         doc_pasta_id = COALESCE(EXCLUDED.doc_pasta_id, pm.doc_pasta_id), atualizado_em = now();
  GET DIAGNOSTICS n = ROW_COUNT;
  -- progresso de metas que saíram vira arquivado; o que voltou, volta a ativo
  UPDATE public.simulado_cronograma_adaptativo_meta m
     SET arquivada = NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id),
         arquivada_em = CASE WHEN NOT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano_meta x WHERE x.plano_id = m.plano_id AND x.meta_id = m.meta_id) THEN COALESCE(m.arquivada_em, now()) ELSE NULL END
   WHERE m.plano_id = p_plano;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.cron_adapt_espelhar_grade(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_adapt_espelhar_grade(uuid, jsonb) TO service_role;

COMMENT ON COLUMN public.simulado_cronograma_adaptativo_plano_meta.doc_titulo IS 'Título do documento no momento do espelho (snapshot p/ relink e p/ exibir Material indisponível).';
COMMENT ON COLUMN public.simulado_cronograma_adaptativo_plano_meta.doc_titulo_norm IS 'Título normalizado (sem acentos/caixa/zeros/sufixos de cópia) — chave do relink por nome.';
COMMENT ON COLUMN public.simulado_cronograma_adaptativo_plano_meta.doc_pasta_id IS 'Pasta do documento no momento do espelho.';

INSERT INTO public.simulado_cronograma_adaptativo_schema (versao) VALUES ('20261125020000') ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
