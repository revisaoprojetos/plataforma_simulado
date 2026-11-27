-- 20261210000000_transferir_metas_documento.sql   (NÃO APLICADA — revisar e aplicar manualmente)
--
-- MOTIVO: "Transferir metas" de um documento ORIGEM para um documento DESTINO da Biblioteca (com ou sem arquivar a origem).
--
-- FONTE DA VERDADE (resumo): a aula que a meta abre vem do AS, montado em RUNTIME a partir da Biblioteca (documentos publicados em
-- pastas PDFull). O plano do aluno guarda ids POSICIONAIS (pf:<i>) + a ASSINATURA cfg.chavesAS (chave 'd:<uuid>' de cada posição).
-- Quando a assinatura difere do AS atual, o app (garantirAS / remap-as-server.ts) remapeia progresso, grade e contadores POR CHAVE.
-- Logo, "transferir" = trocar a chave 'd:<origem>' por 'd:<destino>' na assinatura de cada plano NÃO arquivado e invalidar o sigAS
-- (sentinela 'tr:…': o iframe antigo é recusado com plano_divergente e recarrega; o remap move tudo para a posição do destino).
-- plano_meta / meta_def são ESPELHOS (se refazem sozinhos); aqui o espelho já é repontado p/ a trava "em uso" ficar coerente.
--
-- O QUE FAZ (uma transação, tudo ou nada):
--   1) planos ativos (arquivada=false, exemplo=false) com assinatura contendo a origem e NÃO o destino:
--        cfg.chavesAS[d:origem] -> d:destino; cfg.sigAS = sentinela; atualizado_em = now(); grade_espelhada_hash = null.
--        Planos que já têm o destino (conflito), planos com a origem órfã (cfg.orfas) e planos legados (sem assinatura) NÃO são tocados.
--   2) plano_meta (espelho) desses planos: documento_id/aula_key da origem -> destino (só tipos de aula: pf|pp|fl|qu|rf|rq;
--      lp/jp/gx são derivados da pasta em runtime e não são transferíveis).
--   3) cfg.lpLegado[*].doc = origem -> destino nos planos ativos.
--   4) simulado_cronograma_meta_conteudo (cronograma "Revisão"/legado): documento_id origem -> destino (pagina_ini zerada).
-- Progresso/concluídas ficam intactos (as linhas simulado_cronograma_adaptativo_meta seguem o remap por chave).
-- NÃO mexe em grifos, anotações, progresso de leitura nem itens de produto (pertencem ao conteúdo/páginas da origem).
--
-- ROLLBACK: drop function if exists public.transferir_metas_documento(uuid, uuid, uuid, uuid, text, boolean, boolean);
-- (o desfazer de dados = executar a função de novo com origem e destino invertidos, enquanto os planos ainda não foram remapeados;
--  o app grava backup do plano antes de remapear: storage pdfs/cronograma/backup-remap/…)

create or replace function public.transferir_metas_documento(
  p_tenant uuid, p_origem uuid, p_destino uuid, p_ator uuid, p_motivo text,
  p_planos boolean default true, p_meta_conteudo boolean default true
) returns jsonb
language plpgsql security definer set search_path = public set statement_timeout = '180s' as $$
declare
  v_o text := 'd:' || lower(p_origem::text);
  v_d text := 'd:' || lower(p_destino::text);
  v_sent text := 'tr:' || to_char(clock_timestamp(), 'YYMMDDHH24MISSMS');
  v_planos uuid[] := '{}';
  n_planos int := 0; n_metas int := 0; n_mc int := 0; n_lp int := 0;
begin
  if p_origem = p_destino then raise exception 'Origem e destino são o mesmo documento.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.simulado_conteudo_documentos where id = p_origem and tenant_id = p_tenant) then
    raise exception 'Documento de origem não encontrado neste tenant.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.simulado_conteudo_documentos where id = p_destino and tenant_id = p_tenant and deletado = false) then
    raise exception 'Documento de destino não encontrado (ou na lixeira) neste tenant.' using errcode = 'P0001';
  end if;

  if p_planos then
    -- 1) assinatura dos planos
    with upd as (
      update public.simulado_cronograma_adaptativo_plano p
         set cfg = jsonb_set(
               jsonb_set(p.cfg, '{chavesAS}',
                 (select jsonb_agg(case when k.v = v_o then to_jsonb(v_d) else to_jsonb(k.v) end order by k.ord)
                    from jsonb_array_elements_text(p.cfg->'chavesAS') with ordinality as k(v, ord))),
               '{sigAS}', to_jsonb(v_sent)),
             atualizado_em = now(), grade_espelhada_hash = null
       where p.tenant_id = p_tenant and p.arquivada = false and p.exemplo = false
         and jsonb_typeof(p.cfg->'chavesAS') = 'array'
         and p.cfg->'chavesAS' @> jsonb_build_array(v_o)
         and not (p.cfg->'chavesAS' @> jsonb_build_array(v_d))
      returning p.id)
    select coalesce(array_agg(id), '{}') into v_planos from upd;
    n_planos := coalesce(array_length(v_planos, 1), 0);

    -- 2) espelho relacional
    if n_planos > 0 then
      update public.simulado_cronograma_adaptativo_plano_meta pm
         set documento_id = p_destino,
             aula_key = case when pm.aula_key = v_o then v_d else pm.aula_key end,
             atualizado_em = now()
       where pm.tenant_id = p_tenant and pm.documento_id = p_origem and pm.plano_id = any(v_planos)
         and pm.tipo in ('pf', 'pp', 'fl', 'qu', 'rf', 'rq');
      get diagnostics n_metas = row_count;
    end if;

    -- 3) descrição de LegProc legado guardada no cfg
    with u as (
      update public.simulado_cronograma_adaptativo_plano p
         set cfg = jsonb_set(p.cfg, '{lpLegado}',
               (select jsonb_object_agg(e.key, case when e.value->>'doc' = p_origem::text then jsonb_set(e.value, '{doc}', to_jsonb(p_destino::text)) else e.value end)
                  from jsonb_each(p.cfg->'lpLegado') e)),
             atualizado_em = now(), grade_espelhada_hash = null
       where p.tenant_id = p_tenant and p.arquivada = false and p.exemplo = false
         and jsonb_typeof(p.cfg->'lpLegado') = 'object'
         and exists (select 1 from jsonb_each(p.cfg->'lpLegado') e where e.value->>'doc' = p_origem::text)
      returning 1)
    select count(*) into n_lp from u;
  end if;

  -- 4) vínculos explícitos do cronograma "Revisão" (legado)
  if p_meta_conteudo then
    begin
      update public.simulado_cronograma_meta_conteudo
         set documento_id = p_destino, pagina_ini = null, atualizado_em = now()
       where tenant_id = p_tenant and documento_id = p_origem;
      get diagnostics n_mc = row_count;
    exception when undefined_table then n_mc := 0;
    end;
  end if;

  return jsonb_build_object('planos', n_planos, 'metas', n_metas, 'meta_conteudo', n_mc, 'lp_legado_planos', n_lp,
                            'plano_ids', to_jsonb(v_planos[1:200]), 'sig', v_sent);
end $$;

revoke all on function public.transferir_metas_documento(uuid, uuid, uuid, uuid, text, boolean, boolean) from public, anon, authenticated;
grant execute on function public.transferir_metas_documento(uuid, uuid, uuid, uuid, text, boolean, boolean) to service_role;
