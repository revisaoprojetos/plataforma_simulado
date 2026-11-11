-- POSIÇÃO DO PRODUTO NA ÁREA DE CURSOS DO ALUNO ("Meus Extensivos"):
--   cursos_modo = 'card'     → card PRÓPRIO na grade (cursos_largura 1 ou 2 colunas; ordem = coluna `ordem` já existente);
--   cursos_modo = 'agrupado' → aparece DENTRO do card de outro produto (cursos_agrupar_em). Se o aluno não tem o produto-pai,
--                              o card volta a ser próprio (nunca some).
-- Leitura tolerante no código: sem estas colunas tudo continua como antes (cards próprios, largura 1).
-- Aplicar manualmente (SQL editor) — inclui NOTIFY pgrst.

alter table public.simulado_produtos add column if not exists cursos_modo text not null default 'card';
alter table public.simulado_produtos add column if not exists cursos_agrupar_em uuid references public.simulado_produtos(id) on delete set null;
alter table public.simulado_produtos add column if not exists cursos_largura smallint not null default 1;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'simulado_produtos_cursos_modo_chk') then
    alter table public.simulado_produtos add constraint simulado_produtos_cursos_modo_chk check (cursos_modo in ('card','agrupado'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'simulado_produtos_cursos_largura_chk') then
    alter table public.simulado_produtos add constraint simulado_produtos_cursos_largura_chk check (cursos_largura in (1,2));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'simulado_produtos_cursos_agrupar_chk') then
    alter table public.simulado_produtos add constraint simulado_produtos_cursos_agrupar_chk check (cursos_agrupar_em is distinct from id and (cursos_modo = 'agrupado') = (cursos_agrupar_em is not null));
  end if;
end $$;

create index if not exists idx_produtos_cursos_agrupar on public.simulado_produtos (cursos_agrupar_em) where cursos_agrupar_em is not null;

notify pgrst, 'reload schema';
