-- Banco de Conteúdos: distingue conjuntos de DISCIPLINA dos de LEGPROC.
-- LegProc é um "tipo novo de conteúdo" (só legislação, sem os campos de disciplina),
-- que ganha uma aba própria no Banco de Conteúdos. Default 'disciplina' preserva tudo que existe.

alter table public.simulado_cronograma_conjuntos
  add column if not exists tipo text not null default 'disciplina';

create index if not exists idx_cron_conjuntos_tipo
  on public.simulado_cronograma_conjuntos (tenant_id, tipo)
  where deletado = false;

notify pgrst, 'reload schema';
