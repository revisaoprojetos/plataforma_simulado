-- ═══════════════════════════════════════════════════════════════════════════
-- Simulados Discursivos — Fase 2 (Fatia 1): ANOTAÇÕES sobre a folha do aluno.
--
-- A "mesa de correção" (estilo AURÉA) deixa o professor marcar a folha manuscrita:
-- destaques (retângulos), pontos, ícones, bolinhas numeradas e notas de texto —
-- cada marca ligada opcionalmente a um QUESITO (competência) e a uma PÁGINA
-- (arquivo). As coordenadas são FRAÇÕES 0–1 da imagem (imunes a zoom/resize/DPI).
--
-- Só isto é novo nesta fatia; o índice dinâmico deriva o estado do quesito das
-- notas já existentes em simulado_correcao_competencias (sem tocar no save atual).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_anotacoes_discursivas (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id      uuid NOT NULL,
  resposta_id    uuid NOT NULL REFERENCES public.simulado_respostas_discursivas(id) ON DELETE CASCADE,
  questao_id     uuid,
  arquivo_id     uuid REFERENCES public.simulado_arquivos(id) ON DELETE CASCADE, -- página onde a marca fica
  competencia_id uuid,                       -- quesito ligado (nullable); SET NULL se a competência sumir
  tipo           text NOT NULL DEFAULT 'destaque', -- destaque | ponto | icone | bolinha | texto
  x              numeric NOT NULL DEFAULT 0, -- 0–1 (canto sup. esq. da marca)
  y              numeric NOT NULL DEFAULT 0,
  largura        numeric,                    -- 0–1 (retângulo de destaque); null p/ ponto/ícone
  altura         numeric,
  cor            text,                       -- hex/token
  icone          text,                       -- nome do ícone (tipo=icone)
  numero         integer,                    -- numeração (tipo=bolinha)
  conteudo       text,                       -- texto da nota (tipo=texto)
  origem         text NOT NULL DEFAULT 'professor', -- professor | ia (IA vem na Fase 3)
  criado_por     uuid,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simulado_anotacoes_disc_resposta ON public.simulado_anotacoes_discursivas(resposta_id);
CREATE INDEX IF NOT EXISTS idx_simulado_anotacoes_disc_tenant   ON public.simulado_anotacoes_discursivas(tenant_id);

-- FK "mole" p/ competência: se a competência for apagada, a marca vira geral (não some).
DO $$ BEGIN
  ALTER TABLE public.simulado_anotacoes_discursivas
    ADD CONSTRAINT simulado_anotacoes_disc_competencia_fk
    FOREIGN KEY (competencia_id) REFERENCES public.simulado_competencias(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;

-- RLS no mesmo padrão das demais tabelas simulado_* (isolamento por tenant).
ALTER TABLE public.simulado_anotacoes_discursivas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_isolation_simulado_anotacoes_discursivas" ON public.simulado_anotacoes_discursivas;
CREATE POLICY "tenant_isolation_simulado_anotacoes_discursivas" ON public.simulado_anotacoes_discursivas
  FOR ALL TO authenticated
  USING      (tenant_id IN (SELECT public.user_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()));

GRANT ALL ON public.simulado_anotacoes_discursivas TO authenticated;
GRANT ALL ON public.simulado_anotacoes_discursivas TO service_role;
