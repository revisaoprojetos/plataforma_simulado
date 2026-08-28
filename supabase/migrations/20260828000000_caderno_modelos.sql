-- Modelos de Caderno (biblioteca EDITÁVEL de modelos/folhas de caderno).
-- Tabela ISOLADA — NÃO toca simulado_cadernos_designer / _teste (construtor). Aplicação MANUAL. Idempotente.
-- As pastas reusam simulado_pastas com folder_area = 'caderno_modelo' (valor livre, sem migração).

CREATE TABLE IF NOT EXISTS simulado_caderno_modelos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  -- { v:1, item: ItemCaderno (auto-contido), origem, padraoRef? } — unifica as 4 modalidades.
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  modalidade text,                       -- folha_respostas | caderno_questoes | caderno_completo | diagnostico
  origem text,                           -- padrao_copia | zero | importado
  pasta_id uuid,                         -- simulado_pastas (folder_area='caderno_modelo'); null = raiz
  cor text,
  icone text,
  capa_url text,
  capa_card_url text,
  deletado boolean NOT NULL DEFAULT false,
  deletado_em timestamptz,
  deletado_por uuid,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caderno_modelos_tenant ON simulado_caderno_modelos (tenant_id) WHERE deletado = false;
CREATE INDEX IF NOT EXISTS idx_caderno_modelos_pasta  ON simulado_caderno_modelos (pasta_id);

-- App acessa via service role (createAdminClient), como o simulado_cadernos_teste: RLS ligado, sem
-- policy para anon/authenticated → leitura/escrita direta pelo cliente fica bloqueada.
ALTER TABLE simulado_caderno_modelos ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
