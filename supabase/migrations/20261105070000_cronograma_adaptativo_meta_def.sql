-- CRONOGRAMA ADAPTATIVO — DEFINIÇÃO DAS METAS (visão do ADMIN, por plataforma — independente de aluno) + ANÁLISE.
--
-- As metas do Adaptativo eram geradas por cálculo (catálogo embutido + Biblioteca + overlay) e só existiam copiadas, por aluno, dentro de cada
-- plano. Esta tabela é o CADASTRO das metas da plataforma: uma linha por AULA (que gera as metas PDFull/PDFlash/Questões/Revisão) e uma linha
-- por META DE LEI SECA (LegProc), com disciplina, número, título, páginas, links, documento da Biblioteca, ordem, ativa/inativa, origem, criado_em…
-- É preenchida/atualizada pelo botão "Sincronizar definições" do admin (lê o conteúdo efetivo: catálogo + Biblioteca + edições do admin).
-- A visão `…_meta_def_analise` cruza cada definição com os planos e o progresso dos alunos (quantos alunos, concluídas, tempo, acertos).
-- Pré-requisitos: 20261105050000 (plano_meta). Aditiva e idempotente. Aplicação manual no SQL Editor.

CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_meta_def (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  tipo          text NOT NULL CHECK (tipo IN ('aula', 'legproc')),
  chave         text NOT NULL,                 -- estável: aula = chave da aula (override/documento/tema); legproc = id da meta (lp:L…:n)
  ref_pos       integer,                       -- aula: posição em AS — é o número que os ids do plano usam (pf:<ref_pos>, fl:…, qu:…)
  disciplina    text,
  numero        text,                          -- nº da aula (texto)
  titulo        text,                          -- aula: tema · legproc: lei
  texto         text,                          -- legproc: orientação de leitura
  paginas       integer,
  minutos       integer,                       -- legproc: duração
  link_qc       text,                          -- questões (QConcursos)
  link_tec      text,                          -- questões (TEC)
  documento_id  uuid,                          -- documento da Biblioteca
  ordem         integer,
  ativa         boolean NOT NULL DEFAULT true, -- entra na distribuição do motor
  origem        text,                          -- biblioteca | catalogo
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, tipo, chave)
);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_def_tenant ON public.simulado_cronograma_adaptativo_meta_def (tenant_id, tipo, disciplina);
ALTER TABLE public.simulado_cronograma_adaptativo_meta_def ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS simulado_cronograma_adaptativo_meta_def_isolation ON public.simulado_cronograma_adaptativo_meta_def;
CREATE POLICY simulado_cronograma_adaptativo_meta_def_isolation ON public.simulado_cronograma_adaptativo_meta_def
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));
COMMENT ON TABLE public.simulado_cronograma_adaptativo_meta_def IS 'DEFINIÇÃO das metas do Adaptativo por plataforma (aulas e metas de lei seca) — cadastro do admin, independente de aluno. Análise: simulado_cronograma_adaptativo_meta_def_analise.';

-- número da aula referenciado pelo id da meta do plano (pf:<i> · pp:<i>:<parte> · fl:<i> · qu:<i> · rf/rq:<sem>:<i>) — coluna gerada + índices p/ a análise
ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta
  ADD COLUMN IF NOT EXISTS ref_aula integer GENERATED ALWAYS AS (
    CASE WHEN tipo IN ('pf','pp','fl','qu') AND split_part(meta_id, ':', 2) ~ '^\d{1,6}$' THEN split_part(meta_id, ':', 2)::integer
         WHEN tipo IN ('rf','rq')           AND split_part(meta_id, ':', 3) ~ '^\d{1,6}$' THEN split_part(meta_id, ':', 3)::integer END
  ) STORED;
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_ref_aula ON public.simulado_cronograma_adaptativo_plano_meta (tenant_id, ref_aula) WHERE ref_aula IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_meta_id  ON public.simulado_cronograma_adaptativo_plano_meta (tenant_id, meta_id);

CREATE OR REPLACE VIEW public.simulado_cronograma_adaptativo_meta_def_analise AS
WITH mp AS (
  SELECT d.id AS def_id, pm.plano_id, pm.estudante_id, pm.meta_id, pm.tipo
    FROM public.simulado_cronograma_adaptativo_meta_def d
    JOIN public.simulado_cronograma_adaptativo_plano_meta pm ON pm.tenant_id = d.tenant_id AND pm.ref_aula = d.ref_pos
   WHERE d.tipo = 'aula'
  UNION ALL
  SELECT d.id, pm.plano_id, pm.estudante_id, pm.meta_id, pm.tipo
    FROM public.simulado_cronograma_adaptativo_meta_def d
    JOIN public.simulado_cronograma_adaptativo_plano_meta pm ON pm.tenant_id = d.tenant_id AND pm.meta_id = d.chave
   WHERE d.tipo = 'legproc'
), agg AS (
  SELECT mp.def_id,
         count(DISTINCT mp.plano_id)    AS planos,
         count(DISTINCT mp.estudante_id) AS alunos,
         count(*)                        AS metas_nos_planos,
         count(*) FILTER (WHERE m.estado = 'done')   AS concluidas,
         count(*) FILTER (WHERE m.estado = 'missed') AS nao_realizadas,
         coalesce(sum(m.tempo_seg), 0)   AS tempo_total_seg,
         coalesce(sum(m.res), 0)         AS questoes_resolvidas,
         coalesce(sum(m.err), 0)         AS questoes_erradas
    FROM mp
    LEFT JOIN public.simulado_cronograma_adaptativo_meta m ON m.plano_id = mp.plano_id AND m.meta_id = mp.meta_id
   GROUP BY mp.def_id
)
SELECT d.*,
       coalesce(a.planos, 0) AS planos, coalesce(a.alunos, 0) AS alunos, coalesce(a.metas_nos_planos, 0) AS metas_nos_planos,
       coalesce(a.concluidas, 0) AS concluidas, coalesce(a.nao_realizadas, 0) AS nao_realizadas,
       coalesce(a.tempo_total_seg, 0) AS tempo_total_seg, coalesce(a.questoes_resolvidas, 0) AS questoes_resolvidas, coalesce(a.questoes_erradas, 0) AS questoes_erradas
  FROM public.simulado_cronograma_adaptativo_meta_def d
  LEFT JOIN agg a ON a.def_id = d.id;

-- SEGURANÇA: visões ignoram RLS por padrão (rodam com os direitos do dono) → qualquer um com a chave pública leria as linhas de todos os alunos.
-- security_invoker faz a visão obedecer à RLS das tabelas de origem; o revoke tira o acesso público (o app usa service_role).
ALTER VIEW public.simulado_cronograma_adaptativo_meta_def_analise SET (security_invoker = true);
REVOKE ALL ON public.simulado_cronograma_adaptativo_meta_def_analise FROM anon, authenticated;
GRANT SELECT ON public.simulado_cronograma_adaptativo_meta_def_analise TO service_role;

NOTIFY pgrst, 'reload schema';
