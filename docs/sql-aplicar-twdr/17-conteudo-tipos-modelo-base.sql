-- 17 — Modelo-base de classificações (6 tipos de sistema por tenant). EXIGE o 16 aplicado (coluna exibicao). Idempotente. Cole no SQL Editor.
-- MODELO-BASE de classificações de conteúdo: semeia, para CADA tenant existente, os 6 tipos de sistema
-- (pdfull, pdfight, pdflash, legproc, jurisclub, questoes) em public.simulado_conteudo_tipos, espelhando
-- TIPOS_SISTEMA de apps/web/lib/cronograma/tipos-conteudo-tipos.ts (slug/nome/nome_aluno/cor/papel/prioridade/ordem/descricao).
-- Pré-requisito: 20261202000000 (tabela) e 20261209000000 (coluna `exibicao`) aplicadas (arquivo 16 no pacote colável).
-- IDEMPOTENTE e NÃO destrutiva: ON CONFLICT (tenant_id, slug) DO NOTHING — linhas já existentes (override/personalizadas) ficam intactas.
-- Não altera documentos/pastas. Sem trigger: tenants novos são semeados pelo app. `exibicao` = '{}' (o app aplica defaults via zod).
-- duracao_padrao_min = NULL (usa o padrão do motor por papel); cor = NULL (como no código).

INSERT INTO public.simulado_conteudo_tipos
  (tenant_id, slug, nome, nome_aluno, cor, papel, duracao_padrao_min, prioridade, ordem, ativo, sistema, descricao, exibicao)
SELECT t.id, v.slug, v.nome, v.nome_aluno, NULL, v.papel, NULL, v.prioridade, v.ordem, true, true, v.descricao, '{}'::jsonb
FROM public.simulado_tenants t
CROSS JOIN (VALUES
  ('pdfull',    'PDFull',    'PDFull',    'leitura',        10, 1, 'Gera a aula (meta de leitura).'),
  ('pdfight',   'PDFight',   'PDFight',   'apoio',          20, 2, 'Material de apoio da aula.'),
  ('pdflash',   'PDFlash',   'PDFlash',   'apoio',          20, 3, 'Material de apoio da aula.'),
  ('legproc',   'LegProc',   'LegProc',   'lei_seca',       30, 4, 'Gera a lei seca por semana.'),
  ('jurisclub', 'JurisClub', 'JurisClub', 'jurisprudencia', 40, 5, 'Gera a meta de jurisprudência.'),
  ('questoes',  'Questões',  'Questões',  'questoes',       50, 6, 'Questões ligadas à aula (não gera meta nova).')
) AS v(slug, nome, nome_aluno, papel, prioridade, ordem, descricao)
ON CONFLICT ON CONSTRAINT simulado_conteudo_tipos_tenant_slug_uq DO NOTHING;

-- VERIFICAÇÃO (rodar à parte): esperado 6 por tenant (ou mais, se houver personalizados).
-- SELECT tenant_id, count(*) AS total, count(*) FILTER (WHERE sistema) AS sistema
--   FROM public.simulado_conteudo_tipos GROUP BY tenant_id ORDER BY tenant_id;

NOTIFY pgrst, 'reload schema';
