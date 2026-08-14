-- Simulados criados pelo ALUNO (construtor pessoal) — reusam a engine (sessão/correção/nota),
-- mas ficam ISOLADOS dos oficiais. Marcados por owner_estudante_id (NULL = oficial do admin).
--
-- Seguro/idempotente: coluna nova nullable (default NULL) — todos os simulados atuais continuam
-- oficiais (owner_estudante_id = NULL). Nenhum dado existente muda.
-- ⚠️ APLICAR ANTES de deployar o código que filtra por owner_estudante_id (senão as listagens
--    oficiais quebrariam por "column does not exist").

alter table public.simulado_simulados
  add column if not exists owner_estudante_id uuid references public.simulado_estudantes(id) on delete cascade;

-- Índice parcial: acelera "os simulados DESTE aluno" (owner_estudante_id = X) sem pesar as
-- listagens oficiais (que filtram por IS NULL — cobertas pelo índice parcial abaixo).
create index if not exists idx_simulado_simulados_owner_estudante
  on public.simulado_simulados (owner_estudante_id, tenant_id)
  where owner_estudante_id is not null;

comment on column public.simulado_simulados.owner_estudante_id is
  'Aluno dono do simulado personalizado (construtor do portal). NULL = simulado oficial do admin. Listagens oficiais filtram owner_estudante_id IS NULL.';
