-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — plataformas de curso e N links por aula
--
-- Antes, cada aula tinha duas colunas fixas: url_qc e url_tec. Isso amarrava o
-- modelo a exatamente dois bancos de questões e exigia migration toda vez que a
-- equipe passasse a usar outro.
--
-- Agora: as plataformas são CADASTRO (por tenant), e uma aula tem N links, um
-- por plataforma. O `tema` continua na aula — é ele que a ficha de desempenho
-- usa como título da linha, e ele não pertence a plataforma nenhuma.
--
--   simulado_cronograma_links       (disciplina, aula, tema)     ← a aula
--     └─ simulado_cronograma_aula_links (link_id, plataforma_id, url)  ← N links
--
-- Seguro aplicar: as tabelas do módulo ainda estão vazias (0 links, 0 metas,
-- 0 cronogramas), então não há dado a migrar.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────────
-- CADASTRO DE PLATAFORMAS
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_plataformas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  nome          text NOT NULL,               -- "QConcursos", "TEC Concursos", "Gran Cursos"…
  slug          text NOT NULL,               -- chave estável usada pela importação
  cor           text,                        -- opcional, para o chip na interface
  ordem         integer NOT NULL DEFAULT 0,  -- ordem de exibição na grade do aluno
  ativo         boolean NOT NULL DEFAULT true,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cron_plataformas_slug
  ON public.simulado_cronograma_plataformas (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cron_plataformas_nome
  ON public.simulado_cronograma_plataformas (tenant_id, lower(nome));

-- ─────────────────────────────────────────────────────────────────────────────
-- N LINKS POR AULA — um por plataforma
CREATE TABLE IF NOT EXISTS public.simulado_cronograma_aula_links (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  link_id       uuid NOT NULL REFERENCES public.simulado_cronograma_links(id) ON DELETE CASCADE,
  plataforma_id uuid NOT NULL REFERENCES public.simulado_cronograma_plataformas(id) ON DELETE CASCADE,
  url           text NOT NULL,
  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  -- Uma aula tem no máximo um link por plataforma: dois links do mesmo banco para a
  -- mesma aula seria ambiguidade, não recurso.
  UNIQUE (link_id, plataforma_id)
);

CREATE INDEX IF NOT EXISTS idx_cron_aula_links_link
  ON public.simulado_cronograma_aula_links (tenant_id, link_id);
CREATE INDEX IF NOT EXISTS idx_cron_aula_links_plataforma
  ON public.simulado_cronograma_aula_links (tenant_id, plataforma_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Semeia as duas plataformas que o gerador legado já usava, por tenant. Os slugs
-- `qc` e `tec` são os que a importação dos dados antigos procura.
INSERT INTO public.simulado_cronograma_plataformas (tenant_id, nome, slug, ordem)
SELECT t.id, p.nome, p.slug, p.ordem
FROM public.simulado_tenants t
CROSS JOIN (VALUES
  ('QConcursos',    'qc',  0),
  ('TEC Concursos', 'tec', 1)
) AS p(nome, slug, ordem)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Migra o que houver nas colunas antigas para o modelo novo (idempotente).
-- Hoje não há nada, mas manter o passo torna a migration segura em qualquer ambiente.
INSERT INTO public.simulado_cronograma_aula_links (tenant_id, link_id, plataforma_id, url)
SELECT l.tenant_id, l.id, p.id, l.url_qc
FROM public.simulado_cronograma_links l
JOIN public.simulado_cronograma_plataformas p ON p.tenant_id = l.tenant_id AND p.slug = 'qc'
WHERE l.url_qc IS NOT NULL AND btrim(l.url_qc) <> ''
ON CONFLICT (link_id, plataforma_id) DO NOTHING;

INSERT INTO public.simulado_cronograma_aula_links (tenant_id, link_id, plataforma_id, url)
SELECT l.tenant_id, l.id, p.id, l.url_tec
FROM public.simulado_cronograma_links l
JOIN public.simulado_cronograma_plataformas p ON p.tenant_id = l.tenant_id AND p.slug = 'tec'
WHERE l.url_tec IS NOT NULL AND btrim(l.url_tec) <> ''
ON CONFLICT (link_id, plataforma_id) DO NOTHING;

-- Colunas antigas saem: o dado já está no modelo novo e deixá-las seria duas
-- fontes de verdade para a mesma informação.
ALTER TABLE public.simulado_cronograma_links DROP COLUMN IF EXISTS url_qc;
ALTER TABLE public.simulado_cronograma_links DROP COLUMN IF EXISTS url_tec;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: mesmo isolamento por tenant das demais tabelas do módulo.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_cronograma_plataformas','simulado_cronograma_aula_links'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_isolation ON public.%I;', t, t);
    EXECUTE format($p$CREATE POLICY %I_isolation ON public.%I
      USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
      WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$, t, t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
