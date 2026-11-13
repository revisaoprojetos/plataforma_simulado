-- REGISTRO DE DOWNLOADS dos materiais pelos alunos (cronograma, biblioteca, produtos, mídia…) + base do dashboard do admin.
-- Uma linha por tentativa: 'baixado' (entregue) ou 'bloqueado' (negado: política da plataforma, flag do documento, permissão,
-- material ainda não liberado no cronograma…). Escrita só pelo servidor (service_role); leitura pelo admin via service_role.
-- Aditiva e idempotente. Aplicação manual no SQL Editor.

CREATE TABLE IF NOT EXISTS public.simulado_download_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  documento_id  uuid,                      -- documento da Biblioteca (pode ficar nulo p/ downloads gerados: DOCX do plano…)
  titulo        text,                      -- título no momento do download (histórico estável)
  origem        text NOT NULL,             -- cronograma | biblioteca | produto | midia | outro
  meta_id       text,                      -- meta do cronograma (id do motor: pf:12, lp:L…:3…), quando a origem é o cronograma
  produto_id    uuid,
  tipo_origem   text,                      -- pdf | docx | video | audio…
  resultado     text NOT NULL CHECK (resultado IN ('baixado', 'bloqueado')),
  motivo        text,                      -- política | documento | permissao | nao_liberado | tipo | indisponivel
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dl_log_tenant_data  ON public.simulado_download_log (tenant_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_dl_log_tenant_doc   ON public.simulado_download_log (tenant_id, documento_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_dl_log_tenant_aluno ON public.simulado_download_log (tenant_id, estudante_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_dl_log_tenant_meta  ON public.simulado_download_log (tenant_id, meta_id) WHERE meta_id IS NOT NULL;

ALTER TABLE public.simulado_download_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS simulado_download_log_isolation ON public.simulado_download_log;
CREATE POLICY simulado_download_log_isolation ON public.simulado_download_log
  USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));
COMMENT ON TABLE public.simulado_download_log IS 'Registro de downloads/tentativas de download de materiais pelos alunos. Análise no admin: Cronograma adaptativo › Downloads.';

NOTIFY pgrst, 'reload schema';
