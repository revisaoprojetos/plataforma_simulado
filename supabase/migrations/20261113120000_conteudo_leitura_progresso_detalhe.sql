-- Progresso detalhado de leitura por aula (Biblioteca): onde parou, ultimo acesso, conclusao.
alter table public.simulado_conteudo_leitura_progresso
  add column if not exists pagina        int,
  add column if not exists total_paginas int,
  add column if not exists pct           smallint,
  add column if not exists concluido_em  timestamptz,
  add column if not exists tempo_seg     int not null default 0;
