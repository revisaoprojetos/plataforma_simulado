-- ═══════════════════════════════════════════════════════════════════════════
-- MÓDULO CRONOGRAMA DE ESTUDOS
--
-- Traz para dentro da plataforma o gerador de cronogramas que hoje vive fora
-- dela (um index.html sem login). Ver docs/ESPECIFICACAO_CRONOGRAMA.md (o quê)
-- e docs/PLANO-MODULO-CRONOGRAMA.md (como).
--
-- A migration é ADITIVA: só cria tabelas novas, não altera nem renomeia nada
-- existente. Outras branches em andamento não são afetadas.
--
-- Duas convenções que já causaram bug no gerador legado e estão codificadas aqui:
--   · `metas.dia` é ÍNDICE dentro de dias_curso, NÃO o dia da semana (R3).
--   · `metas.aula` é TEXTO, nunca número (R11): "01" ≠ "1" ≠ "1.1", e o
--     casamento com os links de aula é exato.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- CATÁLOGO — a unidade do CRUD. Um cronograma é uma grade fixa de N semanas.
CREATE TABLE IF NOT EXISTS public.simulado_cronogramas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  slug            text NOT NULL,
  nome            text NOT NULL,
  subtitulo       text,                                 -- só rastro de origem; a tela recalcula (R9)
  total_semanas   integer NOT NULL CHECK (total_semanas >= 1),
  dias_curso      smallint[] NOT NULL,                  -- [1,2,3,4,5,6,0] — 1=seg … 6=sáb, 0=dom
  dias_nome       text[] NOT NULL,                      -- ["Seg","Ter",…] na MESMA ordem
  semanas_revisao integer[] NOT NULL DEFAULT '{}',      -- semanas originais de revisão (R5 as descarta)
  -- Carga horária é COLUNA EXPLÍCITA, não deduzida do nome. No legado (R18) renomear
  -- "12 Matérias (6 horas)" para "12 Matérias – 6h" mudava silenciosamente o grupo.
  carga_horaria   numeric(4,1) NOT NULL CHECK (carga_horaria > 0),
  categoria       text,                                 -- Regulares | Específicos | Em Extinção
  fonte           jsonb NOT NULL DEFAULT '{}'::jsonb,   -- {arquivo, importado_em, linhas}
  ordem           integer NOT NULL DEFAULT 0,
  status          text NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','liberado')),
  acesso_gratuito boolean NOT NULL DEFAULT false,       -- válvula 1: libera p/ todos do tenant
  liberado_em     timestamptz,                          -- spec §8 exige guardar quem liberou
  liberado_por    uuid,
  deletado        boolean NOT NULL DEFAULT false,
  deletado_em     timestamptz,
  deletado_por    uuid,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now(),
  -- Invariante da spec §8: dias_curso e dias_nome têm o mesmo tamanho.
  CONSTRAINT ck_cronograma_dias_pares CHECK (
    array_length(dias_curso, 1) = array_length(dias_nome, 1)
    AND array_length(dias_curso, 1) BETWEEN 1 AND 7
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cronogramas_tenant_slug
  ON public.simulado_cronogramas (tenant_id, slug);
-- Atende a listagem do aluno (status+carga) e a do admin (ordem).
CREATE INDEX IF NOT EXISTS idx_cronogramas_catalogo
  ON public.simulado_cronogramas (tenant_id, status, carga_horaria, ordem)
  WHERE deletado = false;

-- ─────────────────────────────────────────────────────────────────────────────
-- METAS — uma linha da grade. São ~16.700 no catálogo real.
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_metas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  cronograma_id uuid NOT NULL REFERENCES public.simulado_cronogramas(id) ON DELETE CASCADE,
  semana        integer  NOT NULL CHECK (semana >= 1),
  dia           smallint NOT NULL CHECK (dia BETWEEN 0 AND 6),   -- ÍNDICE em dias_curso (R3)
  tipo          text NOT NULL CHECK (tipo IN ('pdfull','quest','legproc','flash','juris','simulado')),
  disciplina    text NOT NULL,
  aula          text,          -- TEXTO. Converter para número quebra os 405 links (R11)
  conteudo      text,
  duracao       text,          -- texto livre: "3 - 4h", "30 min - 1h", "1:30h - 2h"
  ordem         integer NOT NULL DEFAULT 0,
  -- Meta do tipo 'simulado': aponta uma prova DESTA plataforma (simulado_id) OU uma
  -- externa (nome + url). Sem FK em simulado_id de propósito: um ON DELETE SET NULL
  -- seria um UPDATE, que re-avaliaria o CHECK abaixo e impediria excluir o simulado.
  -- O id é resolvido em leitura; o não-encontrado vira aviso no CRUD, não erro em produção.
  simulado_id           uuid,
  simulado_externo_nome text,
  simulado_externo_url  text,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_meta_simulado CHECK (
    tipo <> 'simulado'
    OR simulado_id IS NOT NULL
    OR (simulado_externo_nome IS NOT NULL AND simulado_externo_url IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_cron_metas_grade
  ON public.simulado_cronograma_metas (cronograma_id, semana, dia, ordem);
CREATE INDEX IF NOT EXISTS idx_cron_metas_tenant
  ON public.simulado_cronograma_metas (tenant_id, cronograma_id);
-- Atende o aviso "meta de questões sem link cadastrado" (spec §8).
CREATE INDEX IF NOT EXISTS idx_cron_metas_par_link
  ON public.simulado_cronograma_metas (tenant_id, disciplina, aula)
  WHERE aula IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- LINKS DE AULA — tabela por tenant, NÃO por cronograma: o link pertence ao par
-- (disciplina, aula) e vale para todo cronograma que citar aquela aula.
-- É o único lugar onde o `tema` da aula existe (a ficha de desempenho usa como título).
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  disciplina    text NOT NULL,
  aula          text NOT NULL,
  tema          text,
  url_qc        text,          -- QConcursos
  url_tec       text,          -- TEC Concursos
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cron_links
  ON public.simulado_cronograma_links (tenant_id, disciplina, aula);

-- ─────────────────────────────────────────────────────────────────────────────
-- LIBERAÇÃO — espelha o simulado: vínculo por GRUPO alimenta a MATRÍCULA, que é o
-- gate final. Diferença: o simulado passa pelo "banco" (pasta) porque herda dele;
-- cronograma não pertence a banco nenhum, então o vínculo grupo→cronograma é direto.
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_grupos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  cronograma_id uuid NOT NULL REFERENCES public.simulado_cronogramas(id) ON DELETE CASCADE,
  grupo_id      uuid NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cronograma_id, grupo_id)
);
CREATE INDEX IF NOT EXISTS idx_cron_grupos_grupo
  ON public.simulado_cronograma_grupos (tenant_id, grupo_id);

-- MATRÍCULA = o portão. Sem linha aqui (e sem válvula), o aluno não vê o cronograma.
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_matriculas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  cronograma_id uuid NOT NULL REFERENCES public.simulado_cronogramas(id) ON DELETE CASCADE,
  estudante_id  uuid NOT NULL,
  liberado      boolean NOT NULL DEFAULT true,
  status        text NOT NULL DEFAULT 'ativa' CHECK (status IN ('ativa','suspensa','cancelada')),
  origem        text NOT NULL DEFAULT 'manual' CHECK (origem IN ('manual','grupo','importacao','api')),
  grupo_id      uuid,          -- qual grupo originou (quando origem='grupo')
  criado_em     timestamptz NOT NULL DEFAULT now()
);
-- O índice único existe DESDE O DIA 1 — em simulado_matriculas ele veio depois, e as
-- duplicatas geradas nesse intervalo forçam leitura defensiva até hoje.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cron_matriculas
  ON public.simulado_cronograma_matriculas (tenant_id, estudante_id, cronograma_id);
CREATE INDEX IF NOT EXISTS idx_cron_matriculas_estudante
  ON public.simulado_cronograma_matriculas (tenant_id, estudante_id);

-- Válvula 2: acesso avulso com prazo relativo (espelha simulado_acessos; cronograma
-- não tem "tentativas", então essa coluna não existe aqui).
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_acessos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  cronograma_id uuid NOT NULL REFERENCES public.simulado_cronogramas(id) ON DELETE CASCADE,
  estudante_id  uuid NOT NULL,
  liberado_em   timestamptz NOT NULL DEFAULT now(),
  prazo_valor   integer NOT NULL CHECK (prazo_valor > 0),
  prazo_unidade text NOT NULL CHECK (prazo_unidade IN ('horas','dias','meses')),
  expira_em     timestamptz NOT NULL,
  concedido_por uuid,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_acessos_estudante
  ON public.simulado_cronograma_acessos (tenant_id, estudante_id, expira_em DESC);

-- Válvula 3: testadores. Atravessam qualquer bloqueio (inclusive rascunho) para validar
-- antes de liberar em massa. cronograma_id NULL = testador do MÓDULO inteiro.
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_testadores (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  cronograma_id uuid REFERENCES public.simulado_cronogramas(id) ON DELETE CASCADE,
  estudante_id  uuid NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cron_testadores
  ON public.simulado_cronograma_testadores
  (tenant_id, estudante_id, COALESCE(cronograma_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ─────────────────────────────────────────────────────────────────────────────
-- EMISSÕES — o cronograma SALVO do aluno, e ao mesmo tempo o registro de quem emitiu.
--
-- Guarda o FORMULÁRIO, não a grade montada: a grade é 100% derivável dele
-- (gerarGrade(cronograma, metas, formulario)) e teria milhares de linhas. Vantagem
-- real: corrigir uma meta no catálogo passa a refletir no cronograma do aluno ao
-- reabrir, em vez de congelar um retrato velho.
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_emissoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL,
  cronograma_id   uuid NOT NULL,
  -- Snapshots: o registro de uso não pode virar "(cronograma excluído)" depois.
  cronograma_slug text NOT NULL,
  cronograma_nome text NOT NULL,
  estudante_id    uuid NOT NULL,          -- para QUEM é o cronograma
  estudante_nome  text,
  -- ator_tipo='estudante' + ator_id=estudante_id → emissão própria.
  -- ator_tipo='usuario'   + ator_id=auth.users.id → equipe emitindo em nome do aluno.
  ator_tipo       text NOT NULL CHECK (ator_tipo IN ('estudante','usuario')),
  ator_id         uuid,
  via_acesso      text CHECK (via_acesso IN ('matricula','avulso','gratuito','testador','equipe')),
  titulo          text,                   -- rótulo editável, p/ o aluno distinguir os seus
  formulario      jsonb NOT NULL,         -- {nome, carga, inicio, revisao{}, recesso{}, paleta}
  resumo          jsonb,                  -- os 4 números do topo + conclusão
  is_teste        boolean NOT NULL DEFAULT false,   -- emissão de testador: fora das estatísticas
  arquivada       boolean NOT NULL DEFAULT false,
  criado_em       timestamptz NOT NULL DEFAULT now(),
  atualizado_em   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_emissoes_estudante
  ON public.simulado_cronograma_emissoes (tenant_id, estudante_id, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_cron_emissoes_cronograma
  ON public.simulado_cronograma_emissoes (tenant_id, cronograma_id, criado_em DESC);

-- DOWNLOADS — uma linha por clique de exportação. Espelha simulado_relatorio_eventos:
-- telemetria fina, separada da pergunta "que cronogramas este aluno tem?".
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_downloads (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL,
  emissao_id uuid NOT NULL REFERENCES public.simulado_cronograma_emissoes(id) ON DELETE CASCADE,
  botao      text NOT NULL CHECK (botao IN ('docx','ficha','csv')),
  ator_tipo  text CHECK (ator_tipo IN ('estudante','usuario')),
  ator_id    uuid,
  criado_em  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cron_downloads_emissao
  ON public.simulado_cronograma_downloads (tenant_id, emissao_id);
CREATE INDEX IF NOT EXISTS idx_cron_downloads_data
  ON public.simulado_cronograma_downloads (tenant_id, criado_em DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- CONFIG POR TENANT — rollout do módulo. Mesmo padrão de simulado_gamificacao_config:
-- ligar por tenant é mais seguro que uma constante global em lib/flags.ts.
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_config (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES public.simulado_tenants(id) ON DELETE CASCADE,
  ativo               boolean  NOT NULL DEFAULT false,
  paleta_padrao       text     NOT NULL DEFAULT 'revisao',
  revisao_padrao_cada smallint NOT NULL DEFAULT 12,
  aviso_topo          text,
  criado_em           timestamptz NOT NULL DEFAULT now(),
  atualizado_em       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id)
);

-- Uma linha por tenant existente, desligada. Idempotente.
INSERT INTO public.simulado_cronograma_config (tenant_id)
SELECT id FROM public.simulado_tenants
ON CONFLICT (tenant_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: isolamento por tenant do usuário logado (o app usa service role, que bypassa).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_cronogramas','simulado_cronograma_metas','simulado_cronograma_links',
    'simulado_cronograma_grupos','simulado_cronograma_matriculas','simulado_cronograma_acessos',
    'simulado_cronograma_testadores','simulado_cronograma_emissoes','simulado_cronograma_downloads',
    'simulado_cronograma_config'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
    EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
      USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- IMPORTAÇÃO ATÔMICA — "ou entra tudo, ou não entra nada" (spec §9, item 3).
--
-- O PostgREST não faz transação multi-statement: um DELETE seguido de INSERT pela API
-- pode deixar o cronograma SEM metas se o segundo falhar. Esta função resolve numa
-- chamada só. Reimportar NÃO rebaixa o status (spec §9, item 5) — por isso não há
-- UPDATE de `status` aqui.
CREATE OR REPLACE FUNCTION public.simulado_cronograma_substituir_metas(
  p_tenant uuid, p_cronograma uuid, p_metas jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_antes  integer;
  v_depois integer;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.simulado_cronogramas
    WHERE id = p_cronograma AND tenant_id = p_tenant AND deletado = false
  ) THEN
    RAISE EXCEPTION 'Cronograma % não encontrado no tenant %', p_cronograma, p_tenant;
  END IF;

  SELECT count(*) INTO v_antes
    FROM public.simulado_cronograma_metas
    WHERE tenant_id = p_tenant AND cronograma_id = p_cronograma;

  DELETE FROM public.simulado_cronograma_metas
    WHERE tenant_id = p_tenant AND cronograma_id = p_cronograma;

  INSERT INTO public.simulado_cronograma_metas
    (tenant_id, cronograma_id, semana, dia, tipo, disciplina, aula, conteudo, duracao, ordem,
     simulado_id, simulado_externo_nome, simulado_externo_url)
  SELECT
    p_tenant, p_cronograma,
    (m->>'semana')::integer,
    (m->>'dia')::smallint,
    m->>'tipo',
    m->>'disciplina',
    NULLIF(m->>'aula', ''),        -- ->> devolve TEXTO: "01" continua "01", não vira 1
    NULLIF(m->>'conteudo', ''),
    NULLIF(m->>'duracao', ''),
    COALESCE((m->>'ordem')::integer, 0),
    NULLIF(m->>'simulado_id', '')::uuid,
    NULLIF(m->>'simulado_externo_nome', ''),
    NULLIF(m->>'simulado_externo_url', '')
  FROM jsonb_array_elements(p_metas) AS m;

  GET DIAGNOSTICS v_depois = ROW_COUNT;

  UPDATE public.simulado_cronogramas
    SET atualizado_em = now()
    WHERE id = p_cronograma AND tenant_id = p_tenant;

  RETURN jsonb_build_object('antes', v_antes, 'depois', v_depois);
END $$;

-- SECURITY DEFINER + escopo de tenant por parâmetro: só o service role pode chamar.
-- Os papéis anon/authenticated são do Supabase; o REVOKE deles é condicional para a
-- migration continuar aplicável num Postgres puro (validação local, CI).
REVOKE ALL ON FUNCTION public.simulado_cronograma_substituir_metas(uuid, uuid, jsonb) FROM public;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.simulado_cronograma_substituir_metas(uuid, uuid, jsonb) FROM %I;', r);
    END IF;
  END LOOP;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RBAC — a fonte de verdade em runtime é esta tabela; lib/rbac-catalogo.ts é só rótulo.
-- `liberar` é separado de `update` porque a spec §8 reserva liberar/voltar-a-rascunho
-- e excluir só para admin: é o que decide se o aluno enxerga.
INSERT INTO public.simulado_permissions (resource, action) VALUES
  ('cronogramas','view'),
  ('cronogramas','create'),
  ('cronogramas','update'),
  ('cronogramas','delete'),
  ('cronogramas','liberar'),
  ('cronogramas','emitir')
ON CONFLICT (resource, action) DO NOTHING;

NOTIFY pgrst, 'reload schema';
