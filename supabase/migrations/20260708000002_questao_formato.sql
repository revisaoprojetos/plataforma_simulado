-- Classificação do formato da questão objetiva.
-- 'multipla'      = múltipla escolha (A–E)
-- 'certo_errado'  = julgamento Certo/Errado (objetiva de 2 opções: Certo e Errado)
-- Certo/Errado continua sendo tipo = 'objetiva' (não quebra correção/renderização);
-- o `formato` só CLASSIFICA a questão para filtros/relatórios/exibição futuros.

alter table simulado_questoes
  add column if not exists formato text not null default 'multipla';
