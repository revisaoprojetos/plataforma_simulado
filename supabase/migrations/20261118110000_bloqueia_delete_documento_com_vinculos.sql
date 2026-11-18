-- 20261118110000_bloqueia_delete_documento_com_vinculos.sql   (NÃO APLICADA — revisar e aplicar manualmente)
--
-- MOTIVO: o delete/soft-delete de um documento da Biblioteca apagou (via FK ON DELETE CASCADE) ou desorganizou grifos,
-- anotações, progresso de leitura e metas de cronograma dos alunos (incidente 11/11 e 17/11/2026). Defesa em
-- profundidade NO BANCO — pega ação única, lote, pasta, scripts e SQL manual.
--
-- O QUE PROTEGE
--  A) simulado_conteudo_documentos
--     * BEFORE DELETE e BEFORE UPDATE OF deletado (false -> true): RAISE EXCEPTION se o documento tem VÍNCULOS
--       (grifos pdf/html, progresso de leitura, metas de cronograma [plano_meta/meta_def/meta_conteudo],
--       itens de produto 'documento_biblioteca', atualizações, itens de caderno de aluno, questões inline) OU está EM USO.
--     * BEFORE UPDATE OF pasta_id / categoria / status (publicado -> outro): RAISE se o documento está EM USO.
--     "EM USO" = o documento compõe metas de plano de aluno NÃO arquivado
--       (simulado_cronograma_adaptativo_plano_meta.documento_id com plano.arquivada=false) ou meta ativa do
--       catálogo (simulado_cronograma_adaptativo_meta_def.ativa). Hoje: 367 documentos.
--     "Ocultar" (coluna oculto), "Substituir documento" (nova versão no mesmo id) e renomear continuam livres.
--  B) simulado_pastas
--     * BEFORE UPDATE OF deletado / pai_id / folder_area / cronograma_tipo_material / disciplina_id e BEFORE DELETE:
--       RAISE se a pasta (ou qualquer subpasta viva) contém documento EM USO.
--  C) Exceção CONTROLADA (somente super-admin, com MOTIVO e REGISTRO):
--       public.executar_override_documentos(...) e public.executar_override_pasta(...) — SECURITY DEFINER, exigem
--       motivo >= 10 caracteres, gravam em simulado_bloqueio_overrides (quem/quando/motivo/alvo/antes/depois) e
--       liberam o trigger SÓ dentro da mesma transação (set_config local + conferência da linha de override).
--       Setar o GUC "na mão" NÃO libera nada: o trigger confere se existe a linha de override recente (15 min).
--       Para um DELETE físico excepcional (ex.: purge de tenant/teste) em SQL: dentro de BEGIN…COMMIT chame
--       `select public.liberar_bloqueio('motivo claro…', '<ator uuid>', '<tenant uuid>', 'documento', null, 'delete_fisico')`
--       e então o DELETE. Fica registrado.
--  D) Índices de apoio aos EXISTS dos triggers (as FKs de vínculo não tinham índice começando por documento_id).
--
-- ROLLBACK (seguro; só remove proteção):
--   drop trigger if exists trg_documento_protegido_upd on public.simulado_conteudo_documentos;
--   drop trigger if exists trg_documento_protegido_del on public.simulado_conteudo_documentos;
--   drop trigger if exists trg_pasta_protegida_upd on public.simulado_pastas;
--   drop trigger if exists trg_pasta_protegida_del on public.simulado_pastas;
--   drop function if exists public.trg_documento_protegido(), public.trg_pasta_protegida(),
--     public.documento_em_uso(uuid), public.documento_vinculos(uuid, uuid), public.pasta_docs_em_uso(uuid, uuid),
--     public.bloqueio_liberado(), public.liberar_bloqueio(text, uuid, uuid, text, uuid, text),
--     public.executar_override_documentos(text, uuid, uuid, uuid[], text, text),
--     public.executar_override_pasta(text, uuid, uuid, uuid, text, text);
--   (a tabela simulado_bloqueio_overrides e os índices podem ficar — são só auditoria/apoio.)
--
-- Observação de ordem: este arquivo mantém a numeração planejada 20261118110000, anterior a migrações já criadas
-- (20261124…). Se o CLI reclamar de ordem, aplique com o SQL Editor ou renomeie para um timestamp mais novo.

-- ── 1) Auditoria dos overrides ────────────────────────────────────────────────────────────
create table if not exists public.simulado_bloqueio_overrides (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid,
  ator_id     uuid,
  alvo_tipo   text not null,                 -- 'documento' | 'pasta'
  alvo_id     uuid,
  acao        text not null,
  motivo      text not null check (length(btrim(motivo)) >= 10),
  antes       jsonb,
  depois      jsonb,
  criado_em   timestamptz not null default now()
);
create index if not exists idx_bloqueio_overrides_tenant on public.simulado_bloqueio_overrides (tenant_id, criado_em desc);
alter table public.simulado_bloqueio_overrides enable row level security;  -- só service role (sem policies)

-- ── 2) Índices de apoio (EXISTS dos triggers) ─────────────────────────────────────────────
create index if not exists idx_conteudo_anot_doc          on public.simulado_conteudo_anotacoes (tenant_id, documento_id);
create index if not exists idx_conteudo_leitura_prog_doc  on public.simulado_conteudo_leitura_progresso (documento_id);
create index if not exists idx_cron_adapt_meta_def_doc    on public.simulado_cronograma_adaptativo_meta_def (documento_id) where documento_id is not null;
create index if not exists idx_produto_modulo_itens_ref   on public.simulado_produto_modulo_itens (ref_id) where tipo_ref = 'documento_biblioteca';
create index if not exists idx_caderno_itens_doc          on public.simulado_aluno_caderno_itens (documento_id) where documento_id is not null;

-- ── 3) Funções de decisão ─────────────────────────────────────────────────────────────────
create or replace function public.documento_em_uso(p_doc uuid) returns boolean
language sql stable as $$
  select exists (
           select 1 from public.simulado_cronograma_adaptativo_plano_meta pm
             join public.simulado_cronograma_adaptativo_plano p on p.id = pm.plano_id
            where pm.documento_id = p_doc and p.arquivada = false)
      or exists (
           select 1 from public.simulado_cronograma_adaptativo_meta_def md
            where md.documento_id = p_doc and md.ativa)
$$;

-- Lista (csv) dos tipos de vínculo existentes; '' = nenhum.
create or replace function public.documento_vinculos(p_tenant uuid, p_doc uuid) returns text
language plpgsql stable as $$
declare r text[] := '{}';
begin
  if exists (select 1 from public.simulado_conteudo_grifos_pdf where tenant_id = p_tenant and documento_id = p_doc)
     or exists (select 1 from public.simulado_conteudo_anotacoes where tenant_id = p_tenant and documento_id = p_doc) then r := r || 'grifos'; end if;
  if exists (select 1 from public.simulado_cronograma_adaptativo_plano_meta where documento_id = p_doc)
     or exists (select 1 from public.simulado_cronograma_adaptativo_meta_def where documento_id = p_doc)
     or exists (select 1 from public.simulado_cronograma_meta_conteudo where documento_id = p_doc) then r := r || 'metas'; end if;
  if exists (select 1 from public.simulado_conteudo_leitura_progresso where documento_id = p_doc) then r := r || 'progresso'; end if;
  if exists (select 1 from public.simulado_produto_modulo_itens where ref_id = p_doc and tipo_ref = 'documento_biblioteca' and coalesce(deletado, false) = false) then r := r || 'produto'; end if;
  if exists (select 1 from public.simulado_conteudo_atualizacoes where tenant_id = p_tenant and documento_id = p_doc and coalesce(deletado, false) = false) then r := r || 'atualizacoes'; end if;
  if exists (select 1 from public.simulado_aluno_caderno_itens where documento_id = p_doc) then r := r || 'caderno'; end if;
  if exists (select 1 from public.simulado_conteudo_quiz_questoes where documento_id = p_doc) then r := r || 'questoes'; end if;
  return array_to_string(r, ',');
end $$;

-- Nº de documentos EM USO (até 50) na pasta e subpastas vivas.
create or replace function public.pasta_docs_em_uso(p_tenant uuid, p_pasta uuid) returns int
language sql stable as $$
  with recursive sub as (
    select id from public.simulado_pastas where id = p_pasta and tenant_id = p_tenant
    union
    select f.id from public.simulado_pastas f join sub s on f.pai_id = s.id where f.tenant_id = p_tenant and f.deletado = false)
  select count(*)::int from (
    select 1 from public.simulado_conteudo_documentos d
     where d.tenant_id = p_tenant and d.deletado = false and d.pasta_id in (select id from sub)
       and public.documento_em_uso(d.id)
     limit 50) x
$$;

-- ── 4) Override controlado (super-admin, com motivo e registro) ───────────────────────────
-- O trigger só aceita o bypass se o GUC apontar para uma linha de override criada nos últimos 15 minutos.
create or replace function public.bloqueio_liberado() returns boolean
language plpgsql stable as $$
declare v text := current_setting('app.bloqueio_override_id', true);
begin
  if v is null or v = '' then return false; end if;
  return exists (select 1 from public.simulado_bloqueio_overrides o where o.id = v::uuid and o.criado_em > now() - interval '15 minutes');
exception when others then return false;
end $$;

create or replace function public.liberar_bloqueio(p_motivo text, p_ator uuid, p_tenant uuid, p_alvo_tipo text, p_alvo_id uuid, p_acao text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_motivo is null or length(btrim(p_motivo)) < 10 then
    raise exception 'Motivo obrigatório (mínimo 10 caracteres) para liberar o bloqueio.' using errcode = 'P0001';
  end if;
  insert into public.simulado_bloqueio_overrides (tenant_id, ator_id, alvo_tipo, alvo_id, acao, motivo)
  values (p_tenant, p_ator, coalesce(p_alvo_tipo, 'documento'), p_alvo_id, coalesce(p_acao, 'override'), btrim(p_motivo))
  returning id into v_id;
  perform set_config('app.bloqueio_override_id', v_id::text, true);   -- local à transação
  return v_id;
end $$;

-- Aplica UMA ação sobre documentos (só UPDATE; nunca delete físico) já com override registrado. p_acao: lixeira|mover|despublicar|categoria
create or replace function public.executar_override_documentos(p_motivo text, p_ator uuid, p_tenant uuid, p_docs uuid[], p_acao text, p_valor text default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_antes jsonb; v_n int;
begin
  v_id := public.liberar_bloqueio(p_motivo, p_ator, p_tenant, 'documento', null, p_acao);
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'titulo', titulo, 'pasta_id', pasta_id, 'categoria', categoria, 'status', status, 'deletado', deletado)), '[]'::jsonb)
    into v_antes from public.simulado_conteudo_documentos where tenant_id = p_tenant and id = any(p_docs);
  if p_acao = 'lixeira' then
    update public.simulado_conteudo_documentos set deletado = true, deletado_em = now(), deletado_por = p_ator where tenant_id = p_tenant and id = any(p_docs) and deletado = false;
  elsif p_acao = 'mover' then
    update public.simulado_conteudo_documentos set pasta_id = nullif(p_valor, '')::uuid where tenant_id = p_tenant and id = any(p_docs);
  elsif p_acao = 'despublicar' then
    update public.simulado_conteudo_documentos set status = coalesce(nullif(p_valor, ''), 'arquivado') where tenant_id = p_tenant and id = any(p_docs);
  elsif p_acao = 'categoria' then
    update public.simulado_conteudo_documentos set categoria = p_valor where tenant_id = p_tenant and id = any(p_docs);
  else
    raise exception 'Ação de override inválida: %', p_acao;
  end if;
  get diagnostics v_n = row_count;
  update public.simulado_bloqueio_overrides set alvo_id = case when array_length(p_docs, 1) = 1 then p_docs[1] end,
         antes = v_antes, depois = jsonb_build_object('acao', p_acao, 'valor', p_valor, 'afetados', v_n, 'ids', to_jsonb(p_docs))
   where id = v_id;
  return v_n;
end $$;

-- Aplica UMA ação sobre uma PASTA. p_acao: lixeira|mover|tipo|disciplina
create or replace function public.executar_override_pasta(p_motivo text, p_ator uuid, p_tenant uuid, p_pasta uuid, p_acao text, p_valor text default null) returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_antes jsonb; v_n int;
begin
  v_id := public.liberar_bloqueio(p_motivo, p_ator, p_tenant, 'pasta', p_pasta, p_acao);
  select to_jsonb(p) - 'capa_meta' - 'desafios' - 'carimbos_def' - 'conquistas_def' into v_antes from public.simulado_pastas p where tenant_id = p_tenant and id = p_pasta;
  if p_acao = 'lixeira' then
    update public.simulado_pastas set deletado = true, deletado_em = now(), deletado_por = p_ator where tenant_id = p_tenant and id = p_pasta;
  elsif p_acao = 'mover' then
    update public.simulado_pastas set pai_id = nullif(p_valor, '')::uuid where tenant_id = p_tenant and id = p_pasta;
  elsif p_acao = 'tipo' then
    update public.simulado_pastas set cronograma_tipo_material = nullif(p_valor, '') where tenant_id = p_tenant and id = p_pasta;
  elsif p_acao = 'disciplina' then
    update public.simulado_pastas set disciplina_id = nullif(p_valor, '')::uuid where tenant_id = p_tenant and id = p_pasta;
  else
    raise exception 'Ação de override inválida: %', p_acao;
  end if;
  get diagnostics v_n = row_count;
  update public.simulado_bloqueio_overrides set antes = v_antes, depois = jsonb_build_object('acao', p_acao, 'valor', p_valor, 'afetados', v_n) where id = v_id;
  return v_n;
end $$;

revoke all on function public.liberar_bloqueio(text, uuid, uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.executar_override_documentos(text, uuid, uuid, uuid[], text, text) from public, anon, authenticated;
revoke all on function public.executar_override_pasta(text, uuid, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.liberar_bloqueio(text, uuid, uuid, text, uuid, text) to service_role;
grant execute on function public.executar_override_documentos(text, uuid, uuid, uuid[], text, text) to service_role;
grant execute on function public.executar_override_pasta(text, uuid, uuid, uuid, text, text) to service_role;

-- ── 5) Triggers ───────────────────────────────────────────────────────────────────────────
create or replace function public.trg_documento_protegido() returns trigger
language plpgsql as $$
declare v text; alt text := 'Use "Substituir documento" (nova versão no mesmo documento) ou "Ocultar".';
begin
  if public.bloqueio_liberado() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.deletado = false and new.deletado = true) then
    v := public.documento_vinculos(old.tenant_id, old.id);
    if v <> '' then
      raise exception 'Documento "%" tem vínculos (%) e não pode ser excluído. %', old.titulo, v, alt using errcode = 'P0001';
    end if;
    if public.documento_em_uso(old.id) then
      raise exception 'Documento "%" está em uso por planos de alunos ativos e não pode ser excluído. %', old.titulo, alt using errcode = 'P0001';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  -- UPDATE: mover / trocar categoria / despublicar
  if new.pasta_id is distinct from old.pasta_id
     or new.categoria is distinct from old.categoria
     or (old.status = 'publicado' and new.status is distinct from 'publicado') then
    if public.documento_em_uso(old.id) then
      raise exception 'Documento "%" está em uso por planos de alunos ativos e não pode ser movido, trocar de categoria ou ser despublicado. %', old.titulo, alt using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_documento_protegido_del on public.simulado_conteudo_documentos;
create trigger trg_documento_protegido_del before delete on public.simulado_conteudo_documentos
  for each row execute function public.trg_documento_protegido();

drop trigger if exists trg_documento_protegido_upd on public.simulado_conteudo_documentos;
create trigger trg_documento_protegido_upd before update of deletado, pasta_id, categoria, status on public.simulado_conteudo_documentos
  for each row execute function public.trg_documento_protegido();

create or replace function public.trg_pasta_protegida() returns trigger
language plpgsql as $$
declare n int;
begin
  if public.bloqueio_liberado() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and not (
       (old.deletado = false and new.deletado = true)
    or new.pai_id is distinct from old.pai_id
    or new.folder_area is distinct from old.folder_area
    or new.cronograma_tipo_material is distinct from old.cronograma_tipo_material
    or new.disciplina_id is distinct from old.disciplina_id) then
    return new;
  end if;
  n := public.pasta_docs_em_uso(old.tenant_id, old.id);
  if n > 0 then
    raise exception 'A pasta "%" contém % documento(s) em uso por planos de alunos ativos e não pode ser movida, excluída ou reclassificada. Use "Substituir documento" ou "Ocultar".', old.nome, n using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

drop trigger if exists trg_pasta_protegida_upd on public.simulado_pastas;
create trigger trg_pasta_protegida_upd before update of deletado, pai_id, folder_area, cronograma_tipo_material, disciplina_id on public.simulado_pastas
  for each row execute function public.trg_pasta_protegida();

drop trigger if exists trg_pasta_protegida_del on public.simulado_pastas;
create trigger trg_pasta_protegida_del before delete on public.simulado_pastas
  for each row execute function public.trg_pasta_protegida();

notify pgrst, 'reload schema';
