-- Segurança (varredura 13/11/2026) — frente storage/banco. IDEMPOTENTE. NÃO destrutiva (nenhum dado é apagado).
--
-- ORDEM SEGURA DE DEPLOY (o código novo funciona ANTES e DEPOIS desta migration):
--   1) Deploy do web (>= esta versão) e do worker. Ele passa a servir TODO PDF do bucket `pdfs` por
--      /api/arquivo/pdf/... (URL assinada gerada no servidor), o que funciona com o bucket ainda público.
--   2) Conferir no ar: material do simulado (enunciado/gabarito), PDFs de cronograma/relatório e prévias do admin.
--   3) SÓ ENTÃO aplicar esta migration (bucket fica privado). Links públicos antigos de `pdfs` passam a dar 400/404 —
--      por isso nada no código novo os expõe (os localizadores gravados no banco são reescritos na leitura).
--   Rollback (se algo externo dependia de URL pública): update storage.buckets set public = true where id = 'pdfs';
--
-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 1) Bucket `pdfs` PRIVADO (+ remove a policy de leitura pública do storage.objects)
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
begin
  update storage.buckets set public = false where id = 'pdfs' and public is distinct from false;
exception when others then
  raise notice 'storage.buckets pdfs: nao foi possivel tornar privado (%): %', sqlstate, sqlerrm;
end $$;

do $$
begin
  drop policy if exists "pdfs_public_read" on storage.objects;
exception when others then
  raise notice 'storage.objects pdfs_public_read: nao removida (%): %', sqlstate, sqlerrm;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 2) RLS ligado onde faltar (tabelas do schema public)
--    - com tenant_id e SEM nenhuma policy → liga RLS + policy de tenant (mesmo padrão das demais: user_tenant_ids()).
--      O app usa service role no servidor (bypassa RLS); o cliente autenticado continua enxergando só o próprio tenant.
--    - sem tenant_id → liga RLS (sem policy = só service role) APENAS para as tabelas-filhas abaixo, verificadas no código
--      como NUNCA lidas pelo cliente autenticado. Qualquer outra tabela sem tenant_id é só LISTADA (NOTICE) → pendência.
-- ───────────────────────────────────────────────────────────────────────────────────────────
do $$
declare
  r record;
  seguras_sem_tenant text[] := array[
    'revisoes_discursivas',
    'simulado_cronograma_adaptativo_plano_disciplina','simulado_cronograma_adaptativo_plano_extra',
    'simulado_cronograma_adaptativo_plano_hora_pontual','simulado_cronograma_adaptativo_plano_horas',
    'simulado_cronograma_adaptativo_plano_lp_ignorar','simulado_cronograma_adaptativo_plano_lp_legado',
    'simulado_cronograma_adaptativo_plano_pagina_lida','simulado_cronograma_adaptativo_plano_recesso',
    'simulado_cronograma_adaptativo_plano_remanejada','simulado_cronograma_adaptativo_plano_rotina',
    'simulado_cronograma_adaptativo_plano_sobra','simulado_cronograma_adaptativo_plano_ultimo_tema'
  ];
  tem_tenant boolean;
  tem_policy boolean;
  tem_funcao boolean := to_regprocedure('public.user_tenant_ids()') is not null;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity
    order by c.relname
  loop
    select exists (select 1 from information_schema.columns
                   where table_schema = 'public' and table_name = r.relname and column_name = 'tenant_id' and data_type = 'uuid')
      into tem_tenant;
    select exists (select 1 from pg_policies where schemaname = 'public' and tablename = r.relname) into tem_policy;

    if tem_tenant and tem_funcao then
      execute format('alter table public.%I enable row level security', r.relname);
      if not tem_policy then
        execute format('drop policy if exists %I on public.%I', 'tenant_isolation_' || r.relname, r.relname);
        execute format(
          'create policy %I on public.%I for all to authenticated '
          'using (tenant_id in (select public.user_tenant_ids())) '
          'with check (tenant_id in (select public.user_tenant_ids()))',
          'tenant_isolation_' || r.relname, r.relname);
      end if;
    elsif not tem_tenant and r.relname = any (seguras_sem_tenant) then
      execute format('alter table public.%I enable row level security', r.relname);
    else
      raise notice 'PENDENCIA RLS: public.% segue SEM RLS (tenant_id=%, user_tenant_ids=%) — revisar manualmente', r.relname, tem_tenant, tem_funcao;
    end if;
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────────────────────
-- 3) GRANTs: menor privilégio para anon/authenticated (o app escreve com service role no servidor)
-- ───────────────────────────────────────────────────────────────────────────────────────────

-- 3a) Em TODAS as tabelas de public: ninguém (anon/authenticated) precisa de TRUNCATE/REFERENCES/TRIGGER;
--     anon nunca escreve (login/identificação do aluno usam service role em rota de API).
do $$
declare r record;
begin
  for r in
    select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r','p')
  loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', r.relname);
    execute format('revoke insert, update, delete on public.%I from anon', r.relname);
  end loop;
end $$;

-- 3b) Tabelas SENSÍVEIS (segredos, credenciais de integração, trilha de auditoria/LGPD, filas): o cliente autenticado
--     (cookie do admin) NÃO escreve nelas — verificado por grep: toda referência `.from('<tabela>')` está em código
--     com service role (createAdminClient). Revoga DML de authenticated (mantém SELECT, já filtrado pelo RLS de tenant).
do $$
declare t text;
begin
  foreach t in array array[
    'api_keys','simulado_ia_config','simulado_curseduca_config','simulado_storage_config',
    'simulado_aluno_acessos','simulado_assinaturas','simulado_webhook_inbox','webhook_endpoints',
    'simulado_integracao_base','simulado_integracao_eventos','simulado_integracao_jobs','simulado_integracao_mapeamentos',
    'simulado_integracao_pessoas','simulado_integracao_sync','simulado_lgpd_solicitacoes','audit_logs',
    'video_config','simulado_config_global','simulado_pdf_jobs','simulado_impersonation_sessoes'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update, delete on public.%I from authenticated', t);
    end if;
  end loop;

  -- Segredos em claro/criptografados: nem leitura pelo cliente autenticado (só service role).
  foreach t in array array['api_keys','simulado_ia_config','simulado_curseduca_config','simulado_storage_config'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;

  -- Tabelas do scanner de segurança: só service role.
  foreach t in array array['seguranca_varreduras','seguranca_achados','seguranca_atualizacoes','seguranca_notificacoes'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- 3c) Tabelas futuras: não nascem com TRUNCATE/REFERENCES/TRIGGER para anon/authenticated nem DML para anon.
do $$
begin
  alter default privileges in schema public revoke truncate, references, trigger on tables from anon, authenticated;
  alter default privileges in schema public revoke insert, update, delete on tables from anon;
exception when others then
  raise notice 'default privileges: nao ajustados (%): %', sqlstate, sqlerrm;
end $$;

-- PENDÊNCIAS CONHECIDAS (NÃO revogadas por dúvida): o cliente autenticado ainda ESCREVE via createClient()/createServiceClient()
-- (service key + cookie do usuário = role authenticated) em: simulado_questoes, simulado_alternativas, simulado_simulados,
-- simulado_webhook_saida, entre outras (≈34 arquivos usam createServiceClient). Migrar essas rotas p/ createAdminClient()
-- e só então revogar DML de authenticated nelas.

-- Diagnóstico: policies abertas (qual/with_check = true ou role anon) — o scanner as reporta; revisar caso a caso.
do $$
declare p record;
begin
  for p in
    select tablename, policyname, cmd, roles
    from pg_policies
    where schemaname = 'public'
      and (btrim(coalesce(qual, '')) = 'true' or btrim(coalesce(with_check, '')) = 'true' or 'anon' = any (roles))
  loop
    raise notice 'POLICY ABERTA: public.% / % (cmd=%, roles=%)', p.tablename, p.policyname, p.cmd, p.roles;
  end loop;
end $$;

notify pgrst, 'reload schema';
