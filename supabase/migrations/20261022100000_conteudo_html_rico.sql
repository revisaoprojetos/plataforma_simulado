-- HTML RICO por versão: formatação original preservada (negrito/itálico/cores/imagens/links) com
-- data-uid por bloco (âncora estável do grifo), alinhado aos uids dos trechos. É o que a ÁREA DE
-- LEITURA do aluno (a mesma do Jurisprudência) renderiza fielmente, com grifos persistidos por aluno.
alter table public.simulado_conteudo_versoes
  add column if not exists html_rico text;

-- Recarrega o schema do PostgREST (landmine: sem isto a coluna some do cache da API).
notify pgrst, 'reload schema';
