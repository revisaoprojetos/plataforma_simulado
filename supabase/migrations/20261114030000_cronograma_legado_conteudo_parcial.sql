-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA LEGADO ("Revisão", plano FIXO no iframe do adaptativo):
--   (1) vínculo META -> DOCUMENTO da Biblioteca (explícito, escolhido pelo admin);
--   (2) progresso por meta do aluno: PARCIAL (ponto de parada) e NÃO REALIZADA.
--
-- Aditiva e idempotente. NÃO altera tabelas existentes. O código degrada sem esta migration:
--   · sem a tabela de vínculos -> só a resolução automática (disciplina+aula -> Biblioteca);
--   · sem a tabela de progresso -> Parcial/Não realizada respondem "indisponível" e o plano segue só com Concluir.
-- `meta_id` NÃO tem FK (mesmo motivo de meta_checks): reimportar o catálogo pode recriar a meta; `chave_meta`
-- (chave estável, migration 20261114020000) reencaixa o registro na meta recriada.
-- ═══════════════════════════════════════════════════════════════════════════

-- (1) Vínculo explícito meta -> documento da Biblioteca (por CRONOGRAMA: vale para todas as emissões dele).
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_meta_conteudo (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  cronograma_id  uuid NOT NULL REFERENCES public.simulado_cronogramas(id) ON DELETE CASCADE,
  meta_id        uuid NOT NULL,
  chave_meta     text,
  documento_id   uuid NOT NULL,          -- simulado_conteudo_documentos.id (sem FK: documento apagado = vínculo ignorado)
  pagina_ini     integer CHECK (pagina_ini IS NULL OR pagina_ini >= 1),
  criado_por     uuid,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cronograma_id, meta_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_meta_conteudo_cron
  ON public.simulado_cronograma_meta_conteudo (tenant_id, cronograma_id);
CREATE INDEX IF NOT EXISTS idx_cron_meta_conteudo_chave
  ON public.simulado_cronograma_meta_conteudo (cronograma_id, chave_meta) WHERE chave_meta IS NOT NULL;

-- (2) Progresso por meta do aluno, dentro de UMA emissão. 'concluida' continua em meta_checks;
--     ausência de linha = pendente. Parcial/Não realizada NÃO mudam a data do plano (plano fixo).
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_meta_progresso (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid NOT NULL,
  emissao_id         uuid NOT NULL REFERENCES public.simulado_cronograma_emissoes(id) ON DELETE CASCADE,
  estudante_id       uuid NOT NULL,
  meta_id            uuid NOT NULL,
  chave_meta         text,
  status             text NOT NULL CHECK (status IN ('parcial', 'nao_realizada')),
  pagina_ate         integer CHECK (pagina_ate IS NULL OR pagina_ate >= 0),   -- PDFull: última página concluída
  total_paginas      integer CHECK (total_paginas IS NULL OR total_paginas >= 1),
  artigo             text,                                                    -- LegProc: artigo de parada
  ponto              text,                                                    -- demais tipos: ponto de parada
  minutos_restantes  integer CHECK (minutos_restantes IS NULL OR minutos_restantes >= 0),
  criado_em          timestamptz NOT NULL DEFAULT now(),
  atualizado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emissao_id, meta_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_meta_prog_emissao
  ON public.simulado_cronograma_meta_progresso (tenant_id, emissao_id);
CREATE INDEX IF NOT EXISTS idx_cron_meta_prog_chave
  ON public.simulado_cronograma_meta_progresso (emissao_id, chave_meta) WHERE chave_meta IS NOT NULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_cronograma_meta_conteudo', 'simulado_cronograma_meta_progresso'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
    EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
      USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
