-- ─────────────────────────────────────────────────────────────────────────────
-- BANCO DE CONTEÚDOS para cronogramas
--
-- Espelha o padrão do banco de questões (banco → simulado montado por seleção):
--   biblioteca reutilizável organizada POR DISCIPLINA → CONJUNTOS DE AULAS, da qual se
--   COMPÕE um cronograma copiando as aulas para `simulado_cronograma_metas` (snapshot).
--
-- Aditiva e idempotente. NÃO toca nas tabelas existentes de cronograma; o compor (na app)
-- só INSERE metas e faz UPSERT nos links já existentes. Pastas reusam `simulado_pastas`
-- com folder_area='cronograma_conteudo' (sem coluna nova). RLS/RBAC iguais aos existentes
-- (reusa as permissions cronogramas:*).
-- ─────────────────────────────────────────────────────────────────────────────

-- CONJUNTO de aulas (content set) — escopado por uma disciplina, igual à dualidade das metas.
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_conjuntos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  disciplina_id  uuid REFERENCES public.simulado_disciplinas(id) ON DELETE SET NULL,
  disciplina     text NOT NULL,                 -- rótulo de exibição (mesma dualidade das metas)
  nome           text NOT NULL,                 -- "Direito Constitucional — Módulo 1"
  descricao      text,
  pasta_id       uuid,                          -- organização em simulado_pastas (folder_area='cronograma_conteudo'); sem FK, tolerante
  cor            text,
  ordem          integer NOT NULL DEFAULT 0,
  deletado       boolean NOT NULL DEFAULT false,
  deletado_em    timestamptz,
  deletado_por   uuid,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_conjuntos_catalogo
  ON public.simulado_cronograma_conjuntos (tenant_id, disciplina_id, ordem) WHERE deletado = false;
CREATE INDEX IF NOT EXISTS idx_cron_conjuntos_pasta
  ON public.simulado_cronograma_conjuntos (tenant_id, pasta_id) WHERE deletado = false;

-- AULA do banco (content item). Disciplina = a do conjunto (não repetida aqui).
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_conjunto_aulas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  conjunto_id    uuid NOT NULL REFERENCES public.simulado_cronograma_conjuntos(id) ON DELETE CASCADE,
  tipo           text NOT NULL,                 -- slug de simulado_cronograma_tipos_meta (validado na app)
  aula           text,                          -- TEXTO ("01"); nunca coagir a número (R11)
  conteudo       text,
  duracao        text,                          -- texto livre ("1:30h - 2h")
  video_url      text,                          -- link de videoaula
  tema           text,                          -- vira o tema do link de aula ao compor
  ordem          integer NOT NULL DEFAULT 0,    -- ordem dentro do conjunto
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_conj_aulas_conjunto
  ON public.simulado_cronograma_conjunto_aulas (tenant_id, conjunto_id, ordem);

-- URLs externas por plataforma da aula do banco (espelha simulado_cronograma_aula_links).
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_conjunto_aula_urls (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  aula_id        uuid NOT NULL REFERENCES public.simulado_cronograma_conjunto_aulas(id) ON DELETE CASCADE,
  plataforma_id  uuid NOT NULL REFERENCES public.simulado_cronograma_plataformas(id) ON DELETE CASCADE,
  url            text NOT NULL,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aula_id, plataforma_id)              -- no máx. 1 url por plataforma por aula
);
CREATE INDEX IF NOT EXISTS idx_cron_conj_aula_urls_aula
  ON public.simulado_cronograma_conjunto_aula_urls (tenant_id, aula_id);

-- Questões anexadas a uma aula do banco (refs — links/referência, sem resolver no v1).
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_conjunto_aula_questoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  aula_id        uuid NOT NULL REFERENCES public.simulado_cronograma_conjunto_aulas(id) ON DELETE CASCADE,
  questao_id     uuid NOT NULL REFERENCES public.simulado_questoes(id) ON DELETE CASCADE,
  ordem          integer NOT NULL DEFAULT 0,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (aula_id, questao_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_conj_aula_questoes_aula
  ON public.simulado_cronograma_conjunto_aula_questoes (tenant_id, aula_id);

-- Refs de questões COPIADAS para a meta ao compor (snapshot por-meta).
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_meta_questoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid NOT NULL,
  meta_id        uuid NOT NULL REFERENCES public.simulado_cronograma_metas(id) ON DELETE CASCADE,
  questao_id     uuid NOT NULL REFERENCES public.simulado_questoes(id) ON DELETE CASCADE,
  ordem          integer NOT NULL DEFAULT 0,
  criado_em      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meta_id, questao_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_meta_questoes_meta
  ON public.simulado_cronograma_meta_questoes (tenant_id, meta_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: isolamento por tenant do usuário logado (o app usa service role, que bypassa).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_cronograma_conjuntos','simulado_cronograma_conjunto_aulas',
    'simulado_cronograma_conjunto_aula_urls','simulado_cronograma_conjunto_aula_questoes',
    'simulado_cronograma_meta_questoes'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
    EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
      USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
  END LOOP;
END $$;

-- Sem novas permissions: reusa cronogramas:view/create/update/delete (já semeadas em 20260820000010).

NOTIFY pgrst, 'reload schema';
