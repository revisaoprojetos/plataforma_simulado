-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — o aluno marca as metas concluídas
--
-- Uma linha por meta marcada, dentro de UMA emissão. O check pertence ao cronograma do
-- aluno, não ao catálogo: dois alunos com o mesmo cronograma têm progressos separados, e
-- o mesmo aluno pode ter duas emissões do mesmo cronograma com progressos diferentes.
--
-- Desmarcar APAGA a linha, e é de propósito: o estado atual é "marcada ou não", e manter
-- linha morta com flag faria toda leitura filtrar por ela. A trilha de quem marcou e
-- quando — inclusive as desmarcações — fica em simulado_audit_logs, que é onde o resto do
-- sistema guarda esse tipo de coisa, com IP e user-agent.
--
-- `meta_id` NÃO tem FK, e isso é escolha, não esquecimento: reimportar o catálogo troca as
-- metas por linhas novas (DELETE + INSERT em simulado_cronograma_substituir_metas). Com FK
-- e ON DELETE CASCADE, uma reimportação apagaria o progresso de todos os alunos de uma vez.
-- Sem FK, as linhas sobrevivem — mas passam a não casar com meta nenhuma. É uma limitação
-- real e conhecida: reimportar o cronograma faz o aluno perder a marcação na tela.
-- Por isso guardamos `data` e `titulo` no momento do check: mesmo órfã, a linha continua
-- dizendo o que o aluno concluiu e quando.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_cronograma_meta_checks (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  emissao_id    uuid NOT NULL REFERENCES public.simulado_cronograma_emissoes(id) ON DELETE CASCADE,
  estudante_id  uuid NOT NULL,
  meta_id       uuid NOT NULL,
  -- Snapshots do momento da marcação: a linha continua legível se a meta sumir do catálogo.
  data          date,
  titulo        text,
  marcada_em    timestamptz NOT NULL DEFAULT now(),
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (emissao_id, meta_id)
);

CREATE INDEX IF NOT EXISTS idx_cron_checks_emissao
  ON public.simulado_cronograma_meta_checks (tenant_id, emissao_id);
-- Para "o que este aluno concluiu, mais recente primeiro".
CREATE INDEX IF NOT EXISTS idx_cron_checks_estudante
  ON public.simulado_cronograma_meta_checks (tenant_id, estudante_id, marcada_em DESC);

DO $$
DECLARE t text := 'simulado_cronograma_meta_checks';
BEGIN
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
  EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
  EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
    USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
END $$;

NOTIFY pgrst, 'reload schema';
