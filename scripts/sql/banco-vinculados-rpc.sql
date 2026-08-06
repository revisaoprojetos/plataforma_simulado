-- ─────────────────────────────────────────────────────────────────────────────
-- Paginação server-side dos VINCULADOS de um banco (aba Estudantes).
--
-- Por quê: as FKs do esqueleto simulado_* estão quebradas → o PostgREST não faz o
-- embed/JOIN entre simulado_pasta_estudantes e simulado_estudantes. Sem JOIN, a aba
-- buscava os ~4.9k vinculados por id em ~34 requisições (chunk) → lenta. Esta função
-- faz o JOIN + o último acesso no banco; o PostgREST pagina o resultado via Range.
--
-- Onde rodar: Supabase → SQL editor (uma vez). É idempotente (create or replace / if not exists).
-- ─────────────────────────────────────────────────────────────────────────────

-- Índices que sustentam o JOIN e o "último acesso" (no-op se já existirem).
create index if not exists idx_pasta_estud_pasta
  on simulado_pasta_estudantes (pasta_id, tenant_id, estudante_id);

create index if not exists idx_sessoes_estud_ativas
  on simulado_sessoes_prova (estudante_id, iniciado_em desc)
  where deletado = false and is_teste = false;

-- Só os campos de EXIBIÇÃO (o "último acesso" e os grupos são carregados por página no client,
-- então não vale computá-los para os ~4,9k aqui). JOIN puro e indexado → PostgREST pagina via Range.
create or replace function simulado_banco_vinculados(p_banco uuid, p_tenant uuid)
returns table (
  id uuid,
  nome text,
  email text,
  telefone text,
  cpf text,
  classificacao text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.nome, e.email, e.telefone, e.cpf, e.classificacao
  from simulado_pasta_estudantes pe
  join simulado_estudantes e on e.id = pe.estudante_id
  where pe.pasta_id = p_banco and pe.tenant_id = p_tenant
  order by e.nome asc, e.id asc
$$;

grant execute on function simulado_banco_vinculados(uuid, uuid) to anon, authenticated, service_role;
