-- E-mails secundários do estudante.
-- Um aluno pode ter e-mail PRINCIPAL (coluna email) + SECUNDÁRIOS (este array), todos
-- resolvendo para o MESMO perfil: o login (portal e embed) aceita qualquer um deles e a
-- importação da Curseduca promove o e-mail que vier na importação a principal, empurrando
-- o anterior para secundário — sem criar duplicata (mesmo estudante, mesma nota/dados).
--
-- Seguro/idempotente: coluna nova, nullable com default '{}'. Não altera dados existentes.
-- Aplicar no SQL Editor do Supabase (produção twdr).

alter table public.simulado_estudantes
  add column if not exists emails_secundarios text[] not null default '{}';

-- Índice GIN para o login achar rápido por e-mail secundário (emails_secundarios @> '{x}').
create index if not exists idx_simulado_estudantes_emails_sec
  on public.simulado_estudantes using gin (emails_secundarios);

comment on column public.simulado_estudantes.emails_secundarios is
  'E-mails alternativos que acessam o MESMO perfil (login aceita principal OU qualquer secundário). A importação Curseduca promove o e-mail importado a principal e move o anterior para cá.';
