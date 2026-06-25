-- ═══════════════════════════════════════════════════════════════════════════
-- Módulo Simulados Discursivos
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Adiciona tipo e discursivo_config à tabela simulados
ALTER TABLE simulados
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'objetivo';

DO $$ BEGIN
  ALTER TABLE simulados ADD CONSTRAINT simulados_tipo_check CHECK (tipo IN ('objetivo', 'discursivo'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE simulados
  ADD COLUMN IF NOT EXISTS discursivo_config jsonb;

-- discursivo_config shape (stored as JSONB):
-- {
--   tema: string,
--   descricao_atividade: string,
--   instrucoes: string,
--   objetivos: string,
--   criterios: string,
--   competencias: string,       -- lista separada por vírgula ou texto livre
--   textos_motivadores: string,
--   referencias: string,
--   observacoes: string,
--   data_limite_envio: string,  -- ISO datetime
--   tempo_disponivel_min: number
-- }

-- 2. Tabela de respostas discursivas (envios dos alunos)
CREATE TABLE IF NOT EXISTS respostas_discursivas (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sessao_id     uuid        NOT NULL REFERENCES sessoes_prova(id)  ON DELETE CASCADE,
  simulado_id   uuid        NOT NULL REFERENCES simulados(id)      ON DELETE CASCADE,
  estudante_id  uuid        NOT NULL REFERENCES estudantes(id)     ON DELETE CASCADE,
  -- arquivos: [{url, nome, tipo, tamanho, ordem}]
  arquivos      jsonb       NOT NULL DEFAULT '[]',
  status        text        NOT NULL DEFAULT 'rascunho',
  enviado_em    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT respostas_discursivas_status_check
    CHECK (status IN ('rascunho','enviado','aguardando_correcao','em_correcao','correcao_finalizada','liberado'))
);

-- 3. Tabela de correções discursivas (professor)
CREATE TABLE IF NOT EXISTS correcoes_discursivas (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  resposta_id         uuid        NOT NULL REFERENCES respostas_discursivas(id) ON DELETE CASCADE,
  professor_id        uuid        REFERENCES administradores(id),
  nota_geral          numeric(5,2),
  notas_competencias  jsonb       DEFAULT '{}',
  nivel_desempenho    text,
  observacoes_finais  text,
  pontos_fortes       text[]      DEFAULT '{}',
  pontos_melhoria     text[]      DEFAULT '{}',
  -- anotacoes: [{id, pagina, x, y, largura?, altura?, tipo, conteudo?, categoria?, cor, carimbo_tipo?, numero}]
  anotacoes           jsonb       NOT NULL DEFAULT '[]',
  status              text        NOT NULL DEFAULT 'em_progresso',
  iniciada_em         timestamptz DEFAULT now(),
  finalizada_em       timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT correcoes_discursivas_nivel_check
    CHECK (nivel_desempenho IS NULL OR nivel_desempenho IN ('insuficiente','regular','bom','muito_bom','excelente')),
  CONSTRAINT correcoes_discursivas_status_check
    CHECK (status IN ('em_progresso','finalizada'))
);

-- 4. Índices
CREATE INDEX IF NOT EXISTS idx_respostas_discursivas_sessao     ON respostas_discursivas(sessao_id);
CREATE INDEX IF NOT EXISTS idx_respostas_discursivas_simulado   ON respostas_discursivas(simulado_id);
CREATE INDEX IF NOT EXISTS idx_respostas_discursivas_estudante  ON respostas_discursivas(estudante_id);
CREATE INDEX IF NOT EXISTS idx_correcoes_discursivas_resposta   ON correcoes_discursivas(resposta_id);

-- 5. RLS
ALTER TABLE respostas_discursivas ENABLE ROW LEVEL SECURITY;
ALTER TABLE correcoes_discursivas ENABLE ROW LEVEL SECURITY;

-- Admins têm acesso total
CREATE POLICY "admin_all_respostas_discursivas" ON respostas_discursivas
  FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

CREATE POLICY "admin_all_correcoes_discursivas" ON correcoes_discursivas
  FOR ALL TO authenticated
  USING   (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid() AND role = 'admin'));

-- ═══════════════════════════════════════════════════════════════════════════
-- AÇÃO MANUAL NECESSÁRIA no Supabase Dashboard:
--
-- 1. Vá em Storage → Buckets → New bucket
-- 2. Nome: discursivas
-- 3. Marque "Public bucket" (leitura pública)
-- 4. Salve.
--
-- 5. Na aba Policies do bucket, adicione:
--    Policy: "Qualquer pessoa pode fazer upload via URL assinada"
--    (o backend gera a URL assinada — sem auth pública de upload direto)
-- ═══════════════════════════════════════════════════════════════════════════
