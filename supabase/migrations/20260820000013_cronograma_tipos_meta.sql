-- ═══════════════════════════════════════════════════════════════════════════
-- CRONOGRAMA — tipos de meta cadastráveis, com comportamento explícito
--
-- Os seis tipos estavam fixos no código e num CHECK. Diferente de categoria e
-- plataforma, que são só rótulos, o TIPO decide sete comportamentos do gerador
-- (R10 a R21). Um CRUD ingênuo criaria metas que o motor não sabe formatar,
-- não ordena e não conta.
--
-- Por isso cada comportamento vira uma COLUNA explícita. Criar um tipo novo é
-- responder seis perguntas, e o motor passa a ler as respostas em vez de
-- reconhecer o slug.
--
-- `metas.tipo` continua sendo o SLUG em texto — não vira FK — por dois motivos:
-- os arquivos de importação trazem o slug ("pdfull", "quest"), e assim uma
-- reimportação não depende de resolver id nenhum. O CHECK sai; quem valida
-- agora é a aplicação, contra o cadastro do tenant.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_cronograma_tipos_meta (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL,
  slug          text NOT NULL,               -- chave usada pelas metas e pela importação
  nome          text NOT NULL,               -- rótulo na tela
  rotulo_docx   text NOT NULL,               -- rótulo na coluna "TIPO DE META" do DOCX
  ordem         integer NOT NULL DEFAULT 0,  -- R10: ordem dentro do dia
  cor           text,
  ativo         boolean NOT NULL DEFAULT true,

  -- ── Comportamento (o que antes era `if (tipo === 'x')` espalhado pelo motor)
  -- R11: mostra os links de questões da aula.
  mostra_links     boolean NOT NULL DEFAULT false,
  -- R12: o conteúdo ganha o prefixo "Aula NN - ".
  prefixo_aula     boolean NOT NULL DEFAULT true,
  -- R15: com aula preenchida, exibe "Disciplina: Aula N" e ignora o conteúdo.
  aula_no_titulo   boolean NOT NULL DEFAULT false,
  -- R14: quebra o conteúdo em título + complemento no primeiro Art./parênteses final.
  quebra_conteudo  boolean NOT NULL DEFAULT false,
  -- R16: entra na contagem de "Atividades" do topo.
  conta_atividade  boolean NOT NULL DEFAULT true,
  -- Linha mais alta no DOCX (hoje só o PDFULL).
  destaque_docx    boolean NOT NULL DEFAULT false,
  -- Aparece em TODAS as páginas do DOCX, ou só na semana em que houver meta dele.
  sempre_no_docx   boolean NOT NULL DEFAULT true,

  criado_em     timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_cron_tipos_slug
  ON public.simulado_cronograma_tipos_meta (tenant_id, slug);
CREATE UNIQUE INDEX IF NOT EXISTS uq_cron_tipos_nome
  ON public.simulado_cronograma_tipos_meta (tenant_id, lower(nome));

-- ─────────────────────────────────────────────────────────────────────────────
-- Semeia os seis tipos com EXATAMENTE o comportamento que o motor tinha em código.
-- Ler esta tabela é ler as regras R10–R21 numa forma tabular.
INSERT INTO public.simulado_cronograma_tipos_meta
  (tenant_id, slug, nome, rotulo_docx, ordem,
   mostra_links, prefixo_aula, aula_no_titulo, quebra_conteudo, conta_atividade, destaque_docx, sempre_no_docx)
SELECT t.id, d.slug, d.nome, d.rotulo_docx, d.ordem,
       d.mostra_links, d.prefixo_aula, d.aula_no_titulo, d.quebra_conteudo, d.conta_atividade, d.destaque_docx, d.sempre_no_docx
FROM public.simulado_tenants t
CROSS JOIN (VALUES
  --  slug        nome                      rotulo_docx               ord  links prefixo aula_tit quebra conta destaq sempre
  ('pdfull',   'PDFULL + Videoaula',     'PDFULL OU VIDEOAULA',      0,  false, true,  false,  false, true,  true,  true ),
  ('flash',    'PDFlash / Flashcards',   'PDFLASH OU FLASHCARDS',    1,  false, true,  false,  false, true,  false, true ),
  ('legproc',  'Legproc',                'LEGPROC',                  2,  false, false, false,  true,  true,  false, true ),
  ('quest',    'Resolução de Questões',  'RESOLUÇÃO DE QUESTÕES',    3,  true,  false, true,   false, true,  false, true ),
  ('simulado', 'Simulado',               'SIMULADO',                 4,  false, true,  false,  false, false, false, false),
  ('juris',    'Atividade Extra',        'ATIVIDADE EXTRA',          5,  false, true,  false,  false, false, false, false)
) AS d(slug, nome, rotulo_docx, ordem, mostra_links, prefixo_aula, aula_no_titulo, quebra_conteudo, conta_atividade, destaque_docx, sempre_no_docx)
ON CONFLICT (tenant_id, slug) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- O CHECK fixo sai: com o cadastro, a lista de tipos válidos passa a ser dado,
-- não código. A aplicação valida contra o cadastro do tenant antes de gravar.
ALTER TABLE public.simulado_cronograma_metas DROP CONSTRAINT IF EXISTS simulado_cronograma_metas_tipo_check;

-- Índice para a tela de metas filtrar/agrupar por tipo sem varrer a tabela.
CREATE INDEX IF NOT EXISTS idx_cron_metas_tipo
  ON public.simulado_cronograma_metas (tenant_id, cronograma_id, tipo);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: mesmo isolamento por tenant das demais tabelas do módulo.
DO $$
BEGIN
  EXECUTE 'ALTER TABLE public.simulado_cronograma_tipos_meta ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS simulado_cronograma_tipos_meta_isolation ON public.simulado_cronograma_tipos_meta';
  EXECUTE $p$CREATE POLICY simulado_cronograma_tipos_meta_isolation ON public.simulado_cronograma_tipos_meta
    USING (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true))
    WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.simulado_tenant_acessos WHERE user_id = auth.uid() AND ativo = true));$p$;
END $$;

NOTIFY pgrst, 'reload schema';
