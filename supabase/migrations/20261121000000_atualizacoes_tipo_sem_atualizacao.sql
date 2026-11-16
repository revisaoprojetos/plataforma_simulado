-- Novo tipo de atualização "sem_atualizacao" (Sem atualizações) em simulado_conteudo_atualizacoes.
-- Idempotente: descobre e recria o CHECK de tipo (nome do constraint pode variar). Itens (jsonb) não têm CHECK de tipo.
do $$
declare r record;
begin
  for r in
    select c.conname from pg_constraint c
     where c.conrelid = 'public.simulado_conteudo_atualizacoes'::regclass and c.contype = 'c'
       and pg_get_constraintdef(c.oid) ilike '%conteudo_novo%'
  loop
    execute format('alter table public.simulado_conteudo_atualizacoes drop constraint %I', r.conname);
  end loop;
  alter table public.simulado_conteudo_atualizacoes add constraint simulado_conteudo_atualizacoes_tipo_check
    check (tipo in ('legislacao','jurisprudencia','correcao','conteudo_novo','sem_atualizacao'));
end $$;

notify pgrst, 'reload schema';
