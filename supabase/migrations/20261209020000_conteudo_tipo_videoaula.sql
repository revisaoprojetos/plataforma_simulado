-- Classificação de sistema "Videoaula" (slug 'videoaula', papel 'apoio') para CADA tenant. Espelha TIPOS_SISTEMA
-- (apps/web/lib/cronograma/tipos-conteudo-tipos.ts). Pré-requisito: 20261209010000 (modelo-base) aplicada.
-- IDEMPOTENTE e NÃO destrutiva: ON CONFLICT DO NOTHING (linhas já existentes ficam intactas). Não altera documentos/pastas.
-- Videoaula não gera meta nova e NÃO entra nas horas do cronograma: é conteúdo ligado à aula pela matriz do Gerador.
INSERT INTO public.simulado_conteudo_tipos
  (tenant_id, slug, nome, nome_aluno, cor, papel, duracao_padrao_min, prioridade, ordem, ativo, sistema, descricao, exibicao)
SELECT t.id, 'videoaula', 'Videoaula', 'Videoaula', NULL, 'apoio', NULL, 60, 7, true, true,
       'Videoaula da Biblioteca ligada à aula/meta (não gera meta nova nem entra nas horas).', '{}'::jsonb
FROM public.simulado_tenants t
ON CONFLICT ON CONSTRAINT simulado_conteudo_tipos_tenant_slug_uq DO NOTHING;

NOTIFY pgrst, 'reload schema';
