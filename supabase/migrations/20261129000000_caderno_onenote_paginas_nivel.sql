-- MEUS CADERNOS (aluno) — OneNote FASE 2 (camada de dados): subpáginas, aparência da página e ordenação da seção.
-- ADITIVA e IDEMPOTENTE (só add column if not exists; nada destrutivo). Depende de 20261127000000_caderno_onenote_fase1.sql.
-- RLS/grants já cobrem as tabelas (políticas são por linha, não por coluna): nada a recriar.
-- O código tolera a ausência destas colunas (árvore devolve nivel=0/fundo=null/regua=null/ordenar_por='manual').
-- Após aplicar: notify pgrst, 'reload schema' (no fim do arquivo).

-- ---------------------------------------------------------------- páginas
-- nivel: 0 = página, 1 = subpágina, 2 = sub-subpágina (a hierarquia é derivada da SEQUÊNCIA por `ordem` dentro da seção;
-- o servidor garante nivel <= nivel da página anterior + 1).
alter table public.simulado_aluno_notebook_paginas
  add column if not exists nivel smallint not null default 0;
-- fundo: chave da paleta fixa (PALETA_FUNDO em lib/aluno/notebook-tipos.ts); null = branco. Nunca hex.
alter table public.simulado_aluno_notebook_paginas
  add column if not exists fundo text;
-- regua: linhas de régua/grade da página; null = sem régua.
alter table public.simulado_aluno_notebook_paginas
  add column if not exists regua text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_nb_paginas_nivel') then
    alter table public.simulado_aluno_notebook_paginas
      add constraint ck_nb_paginas_nivel check (nivel between 0 and 2);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_nb_paginas_fundo') then
    alter table public.simulado_aluno_notebook_paginas
      add constraint ck_nb_paginas_fundo check (fundo is null or fundo ~ '^[a-z0-9_-]{1,20}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_nb_paginas_regua') then
    alter table public.simulado_aluno_notebook_paginas
      add constraint ck_nb_paginas_regua check (regua is null or regua in ('estreita','media','larga','extra','grade_p','grade_m','grade_g'));
  end if;
end $$;

-- ---------------------------------------------------------------- seções
-- ordenar_por: como a árvore ordena as páginas da seção (subpáginas ficam agrupadas sob a página-pai).
alter table public.simulado_aluno_notebook_secoes
  add column if not exists ordenar_por text not null default 'manual';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_nb_secoes_ordenar_por') then
    alter table public.simulado_aluno_notebook_secoes
      add constraint ck_nb_secoes_ordenar_por check (ordenar_por in ('manual','criacao','modificacao','titulo'));
  end if;
end $$;

-- Sem índices novos: nivel/fundo/regua/ordenar_por nunca são filtro (a árvore já usa idx_nb_paginas_secao_ordem).
-- Lixeira de seções (listagem por estudante + deletado_em) — pequena, mas evita varrer o notebook inteiro.
create index if not exists idx_nb_secoes_lixeira
  on public.simulado_aluno_notebook_secoes (estudante_id, deletado_em desc) where deletado_em is not null;

notify pgrst, 'reload schema';
