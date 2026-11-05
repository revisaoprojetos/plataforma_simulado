-- CRONOGRAMA ADAPTATIVO — metas do plano EM LINHAS (como o cronograma normal), separadas do progresso do aluno.
--
-- Antes: a grade do plano ficava inteira num JSON (`simulado_cronograma_adaptativo_plano.plano` = { meta_id: [data, horas] }) e a
-- tabela `simulado_cronograma_adaptativo_meta` guarda só o PROGRESSO do aluno (feita/não realizada, grau, tempo, nota).
-- Agora: `simulado_cronograma_adaptativo_plano_meta` = UMA LINHA POR META do plano (tipo, disciplina, aula, título, documento da
-- Biblioteca, semana, dia, data prevista, horas, ordem, criado_em…). É um ESPELHO relacional da grade (o motor continua gerando o JSON;
-- o app sincroniza as linhas ao gerar/recalcular/migrar o plano e há um botão de preenchimento em lote no admin).
-- Aditiva e idempotente. Aplicação manual no SQL Editor.

CREATE TABLE IF NOT EXISTS public.simulado_cronograma_adaptativo_plano_meta (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  plano_id      uuid NOT NULL REFERENCES public.simulado_cronograma_adaptativo_plano(id) ON DELETE CASCADE,
  meta_id       text NOT NULL,                 -- id do motor: 'pf:12', 'pp:12:1', 'qu:3', 'lp:L3f9a2c1b:4', 'rf:7:12'...
  tipo          text NOT NULL,                 -- prefixo do meta_id: pf | pp | fl | qu | lp | rf | rq
  tipo_nome     text,                          -- PDFull | PDFull (parte) | PDFlash | Questões | LegProc | Revisão PDFlash | Revisão Questões
  parte         integer,                       -- pp:<aula>:<parte>
  disciplina    text,
  aula          text,                          -- nº da aula (texto, como no cronograma normal)
  titulo        text,                          -- tema da aula / lei do LegProc
  documento_id  uuid,                          -- documento da Biblioteca que origina a meta (abre no leitor)
  semana        integer,                       -- semana do plano (1 = semana do início)
  dia           smallint,                      -- 0 = segunda … 6 = domingo
  data_prevista date NOT NULL,
  horas         numeric(6,2),
  ordem         integer NOT NULL DEFAULT 0,    -- ordem dentro do dia
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plano_id, meta_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_plano_data ON public.simulado_cronograma_adaptativo_plano_meta (tenant_id, plano_id, data_prevista, ordem);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_aluno      ON public.simulado_cronograma_adaptativo_plano_meta (tenant_id, estudante_id);
CREATE INDEX IF NOT EXISTS idx_cron_adapt_pm_doc        ON public.simulado_cronograma_adaptativo_plano_meta (documento_id) WHERE documento_id IS NOT NULL;

ALTER TABLE public.simulado_cronograma_adaptativo_plano_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS simulado_cronograma_adaptativo_plano_meta_isolation ON public.simulado_cronograma_adaptativo_plano_meta;
CREATE POLICY simulado_cronograma_adaptativo_plano_meta_isolation ON public.simulado_cronograma_adaptativo_plano_meta
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));

-- controle do espelho: hash da grade já espelhada (pula quando nada mudou) e quando foi
ALTER TABLE public.simulado_cronograma_adaptativo_plano ADD COLUMN IF NOT EXISTS grade_espelhada_hash text;
ALTER TABLE public.simulado_cronograma_adaptativo_plano ADD COLUMN IF NOT EXISTS grade_espelhada_em   timestamptz;

-- descrição das tabelas (aparece no Table Editor)
COMMENT ON TABLE public.simulado_cronograma_adaptativo_plano IS 'PLANO do aluno: configuração (cfg) + grade calculada em JSON (cache do motor). Uma linha por plano/aluno. As metas em linhas estão em simulado_cronograma_adaptativo_plano_meta.';
COMMENT ON TABLE public.simulado_cronograma_adaptativo_meta  IS 'PROGRESSO DO ALUNO por meta (concluída/não realizada, grau, estrelas, acertos/erros, tempo de estudo, nota). NÃO é a definição da meta — essa está em simulado_cronograma_adaptativo_plano_meta.';
COMMENT ON TABLE public.simulado_cronograma_adaptativo_plano_meta IS 'METAS DO PLANO em linhas (uma por meta: tipo, disciplina, aula, título, documento, semana, dia, data prevista, horas, ordem, criado_em). Espelho relacional da grade JSON do plano.';

-- visão única: meta do plano + progresso do aluno + dados do plano
CREATE OR REPLACE VIEW public.simulado_cronograma_adaptativo_metas_visao AS
  SELECT pm.criado_em, pm.tenant_id, pm.estudante_id, pm.plano_id, p.titulo AS plano_titulo,
         pm.meta_id, pm.tipo, pm.tipo_nome, pm.parte, pm.disciplina, pm.aula, pm.titulo, pm.documento_id,
         pm.semana, pm.dia, pm.data_prevista, pm.horas, pm.ordem,
         m.estado, m.tempo_seg, m.grau, m.estrelas, m.res, m.err, m.nota, m.atualizado_em AS progresso_atualizado_em
    FROM public.simulado_cronograma_adaptativo_plano_meta pm
    JOIN public.simulado_cronograma_adaptativo_plano p ON p.id = pm.plano_id
    LEFT JOIN public.simulado_cronograma_adaptativo_meta m ON m.plano_id = pm.plano_id AND m.meta_id = pm.meta_id;

-- SEGURANÇA: visões ignoram RLS por padrão (rodam com os direitos do dono) → qualquer um com a chave pública leria as linhas de todos os alunos.
-- security_invoker faz a visão obedecer à RLS das tabelas de origem; o revoke tira o acesso público (o app usa service_role).
ALTER VIEW public.simulado_cronograma_adaptativo_metas_visao SET (security_invoker = true);
REVOKE ALL ON public.simulado_cronograma_adaptativo_metas_visao FROM anon, authenticated;
GRANT SELECT ON public.simulado_cronograma_adaptativo_metas_visao TO service_role;

NOTIFY pgrst, 'reload schema';
