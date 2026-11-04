-- Biblioteca: CAPA (pasta → documentos) e PÁGINA INICIAL de leitura.
--  * simulado_pastas.capa_url JÁ existe (usada pelo Banco de Questões); aqui entram os modos.
--  * capa_modo / pagina_inicial_modo: 'lote' = a pasta vale p/ TODOS os documentos dentro dela (inclusive subpastas,
--    até uma subpasta definir a sua); 'individual' = a pasta só mostra a própria capa/página e NÃO propaga.
--  * Documento: capa_url e pagina_inicial próprios (têm prioridade sobre a pasta).
-- Aditiva e idempotente. Aplicação manual (SQL Editor). O app tolera a ausência das colunas (cai no comportamento atual).
alter table public.simulado_pastas add column if not exists capa_url text;
alter table public.simulado_pastas add column if not exists capa_modo text not null default 'lote';
alter table public.simulado_pastas add column if not exists pagina_inicial integer;
alter table public.simulado_pastas add column if not exists pagina_inicial_modo text not null default 'lote';

alter table public.simulado_conteudo_documentos add column if not exists capa_url text;
alter table public.simulado_conteudo_documentos add column if not exists pagina_inicial integer;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'simulado_pastas_capa_modo_chk') then
    alter table public.simulado_pastas add constraint simulado_pastas_capa_modo_chk check (capa_modo in ('lote','individual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'simulado_pastas_pagina_modo_chk') then
    alter table public.simulado_pastas add constraint simulado_pastas_pagina_modo_chk check (pagina_inicial_modo in ('lote','individual'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'simulado_pastas_pagina_inicial_chk') then
    alter table public.simulado_pastas add constraint simulado_pastas_pagina_inicial_chk check (pagina_inicial is null or pagina_inicial >= 1);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'simulado_conteudo_doc_pagina_inicial_chk') then
    alter table public.simulado_conteudo_documentos add constraint simulado_conteudo_doc_pagina_inicial_chk check (pagina_inicial is null or pagina_inicial >= 1);
  end if;
end $$;

notify pgrst, 'reload schema';
