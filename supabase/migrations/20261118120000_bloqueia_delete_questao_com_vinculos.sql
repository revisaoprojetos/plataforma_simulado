-- ============================================================================
-- Trava de banco: questão (e banco/pasta de questões) COM VÍNCULOS não pode ser apagada
-- nem enviada para a Lixeira (soft-delete). NÃO APLICADO AUTOMATICAMENTE — revisar e aplicar manualmente.
--
-- POR QUÊ
--   Hoje só 2 FKs de simulado_questoes são NO ACTION (prova_questoes, respostas_objetivas, alternativas);
--   quiz de documento / cronograma (aulas e metas) / conjuntos são ON DELETE CASCADE e as demais referências
--   (leitura_respostas, respostas_avulsas, documento_questoes, cadernos de alunos...) nem têm FK. Um DELETE físico
--   (purge da Lixeira, "excluir definitivamente", SQL manual) apagaria silenciosamente metas/quiz/aulas.
--   Esta migração é a DEFESA EM PROFUNDIDADE: a trava principal está no servidor
--   (apps/web/lib/questoes/dependencias-questao.ts); o banco recusa mesmo se alguém contornar o app.
--
-- O QUE FAZ
--   1) Função public.questao_vinculos(uuid) -> text[]: rótulos dos vínculos VIVOS da questão (vazio = livre).
--   2) Trigger BEFORE DELETE em simulado_questoes: RAISE EXCEPTION se houver vínculo.
--   3) Trigger BEFORE UPDATE OF deletado em simulado_questoes: recusa deletado false->true se houver vínculo.
--      (restaurar true->false e "arquivar" status='arquivada' continuam livres.)
--   4) Mesma regra para simulado_pastas (banco): recusa delete/soft-delete se QUALQUER questão do banco
--      (simulado_questao_pasta) tiver vínculo com simulado/resposta/documento/etc.
--   5) Índices por questao_id nas tabelas filhas que não tinham (EXISTS rápido; sem eles viraria seq scan).
--
-- FLUXOS PRESERVADOS
--   - Importação (CSV/plataforma/webhook) e "unificar duplicadas": hoje NÃO apagam questão — apenas dedupe por
--     external_id/enunciado e ARQUIVAM duplicadas (status='arquivada'). Nada disso é afetado.
--   - Se uma rotina futura fizer soft-delete de duplicata: duplicata SEM vínculo passa normalmente; COM vínculo
--     é recusada (o app devolve a lista de bloqueadas com o motivo; use 'arquivada').
--   - Manutenção pontual pelo DBA: `SET LOCAL app.bypass_trava_questao = 'on';` na MESMA transação libera
--     (não é alcançável via PostgREST). Use só com backup e justificativa.
--
-- ROLLBACK
--   drop trigger if exists trg_questao_bloqueia_delete on public.simulado_questoes;
--   drop trigger if exists trg_questao_bloqueia_softdelete on public.simulado_questoes;
--   drop trigger if exists trg_pasta_bloqueia_delete on public.simulado_pastas;
--   drop trigger if exists trg_pasta_bloqueia_softdelete on public.simulado_pastas;
--   drop function if exists public.trg_bloqueia_questao_com_vinculos();
--   drop function if exists public.trg_bloqueia_pasta_com_vinculos();
--   drop function if exists public.questao_vinculos(uuid);
--   (os índices podem ficar; são inofensivos.)
--
-- NOTA SOBRE ÍNDICES: em tabelas grandes (simulado_leitura_respostas ~211k, simulado_aluno_caderno_itens ~67k,
-- simulado_respostas_avulsas ~35k) prefira rodar os CREATE INDEX abaixo com CONCURRENTLY, fora de transação,
-- um por vez, no console SQL (migração em transação não aceita CONCURRENTLY).
-- ============================================================================

-- 5) Índices (idempotentes)
create index if not exists idx_leitura_respostas_questao       on public.simulado_leitura_respostas (questao_id);
create index if not exists idx_respostas_avulsas_questao       on public.simulado_respostas_avulsas (questao_id);
create index if not exists idx_aluno_caderno_itens_questao     on public.simulado_aluno_caderno_itens (questao_id);
create index if not exists idx_aluno_caderno_questoes_questao  on public.simulado_aluno_caderno_questoes (questao_id);
create index if not exists idx_documento_questoes_questao      on public.simulado_documento_questoes (questao_id);
create index if not exists idx_documento_quiz_questoes_questao on public.simulado_documento_quiz_questoes (questao_id);
create index if not exists idx_conteudo_quiz_questoes_questao  on public.simulado_conteudo_quiz_questoes (questao_id);
create index if not exists idx_cron_conj_aula_questoes_questao on public.simulado_cronograma_conjunto_aula_questoes (questao_id);
create index if not exists idx_cron_meta_questoes_questao      on public.simulado_cronograma_meta_questoes (questao_id);
create index if not exists idx_questao_conjunto_itens_questao  on public.simulado_questao_conjunto_itens (questao_id);
create index if not exists idx_sessao_questao_ordem_questao    on public.simulado_sessao_questao_ordem (questao_id);
create index if not exists idx_respostas_discursivas_questao   on public.simulado_respostas_discursivas (questao_id);
create index if not exists idx_anotacoes_discursivas_questao   on public.simulado_anotacoes_discursivas (questao_id);
create index if not exists idx_simulado_simulado_questoes_q    on public.simulado_simulado_questoes (questao_id);
create index if not exists idx_recorrecoes_questao             on public.simulado_recorrecoes (questao_id);
-- (já existem: simulado_prova_questoes(questao_id), simulado_respostas_objetivas(questao_id,id), simulado_questao_pasta(questao_id))

-- 1) Vínculos vivos da questão (rótulos). SECURITY INVOKER; STABLE.
create or replace function public.questao_vinculos(p_questao uuid)
returns text[]
language plpgsql
stable
as $$
declare
  r text[] := '{}';
begin
  if exists (select 1 from public.simulado_prova_questoes x where x.questao_id = p_questao)                    then r := r || 'simulados'; end if;
  if exists (select 1 from public.simulado_simulado_questoes x where x.questao_id = p_questao)                 then r := r || 'simulados (legado)'; end if;
  if exists (select 1 from public.simulado_respostas_objetivas x where x.questao_id = p_questao)               then r := r || 'respostas de alunos'; end if;
  if exists (select 1 from public.simulado_respostas_avulsas x where x.questao_id = p_questao)                 then r := r || 'respostas avulsas'; end if;
  if exists (select 1 from public.simulado_respostas_discursivas x where x.questao_id = p_questao)             then r := r || 'respostas discursivas'; end if;
  if exists (select 1 from public.simulado_anotacoes_discursivas x where x.questao_id = p_questao)             then r := r || 'anotações de correção'; end if;
  if exists (select 1 from public.simulado_sessao_questao_ordem x where x.questao_id = p_questao)              then r := r || 'sessões de prova'; end if;
  if exists (select 1 from public.simulado_leitura_respostas x where x.questao_id = p_questao)                 then r := r || 'respostas de quiz de leitura'; end if;
  if exists (select 1 from public.simulado_documento_questoes x where x.questao_id = p_questao and not coalesce(x.deletado, false))      then r := r || 'documentos (questões inline)'; end if;
  if exists (select 1 from public.simulado_documento_quiz_questoes x where x.questao_id = p_questao and not coalesce(x.deletado, false)) then r := r || 'documentos (quiz)'; end if;
  if exists (select 1 from public.simulado_conteudo_quiz_questoes x where x.questao_id = p_questao)            then r := r || 'documentos da Biblioteca (quiz)'; end if;
  if exists (select 1 from public.simulado_cronograma_conjunto_aula_questoes x where x.questao_id = p_questao) then r := r || 'aulas do cronograma'; end if;
  if exists (select 1 from public.simulado_cronograma_meta_questoes x where x.questao_id = p_questao)         then r := r || 'metas do cronograma'; end if;
  if exists (select 1 from public.simulado_aluno_caderno_itens x where x.questao_id = p_questao)              then r := r || 'cadernos de alunos'; end if;
  if exists (select 1 from public.simulado_aluno_caderno_questoes x where x.questao_id = p_questao)           then r := r || 'cadernos de alunos'; end if;
  if exists (select 1 from public.simulado_questao_conjunto_itens x where x.questao_id = p_questao)           then r := r || 'conjuntos de questões'; end if;
  if exists (select 1 from public.simulado_recorrecoes x where x.questao_id = p_questao)                       then r := r || 're-correções'; end if;
  return r;
end;
$$;

-- 2) + 3) Trigger de questão (DELETE e soft-delete)
create or replace function public.trg_bloqueia_questao_com_vinculos()
returns trigger
language plpgsql
as $$
declare
  v text[];
begin
  if current_setting('app.bypass_trava_questao', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op = 'UPDATE' then
    -- só interessa a transição deletado false -> true
    if not (coalesce(new.deletado, false) and not coalesce(old.deletado, false)) then
      return new;
    end if;
  end if;

  v := public.questao_vinculos(old.id);
  if coalesce(array_length(v, 1), 0) > 0 then
    raise exception 'Questão % tem vínculos e não pode ser excluída: %. Arquive a questão em vez de excluir.',
      old.id, array_to_string(v, ', ')
      using errcode = 'restrict_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_questao_bloqueia_delete on public.simulado_questoes;
create trigger trg_questao_bloqueia_delete
  before delete on public.simulado_questoes
  for each row execute function public.trg_bloqueia_questao_com_vinculos();

drop trigger if exists trg_questao_bloqueia_softdelete on public.simulado_questoes;
create trigger trg_questao_bloqueia_softdelete
  before update of deletado on public.simulado_questoes
  for each row
  when (new.deletado is true and old.deletado is distinct from true)
  execute function public.trg_bloqueia_questao_com_vinculos();

-- 4) Trigger de banco/pasta: recusa se alguma questão do banco tiver vínculo.
create or replace function public.trg_bloqueia_pasta_com_vinculos()
returns trigger
language plpgsql
as $$
declare
  q uuid;
  v text[];
  n int := 0;
begin
  if current_setting('app.bypass_trava_questao', true) = 'on' then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'UPDATE' and not (coalesce(new.deletado, false) and not coalesce(old.deletado, false)) then
    return new;
  end if;

  for q in select qp.questao_id from public.simulado_questao_pasta qp where qp.pasta_id = old.id loop
    v := public.questao_vinculos(q);
    if coalesce(array_length(v, 1), 0) > 0 then
      select count(*) into n from public.simulado_questao_pasta qp where qp.pasta_id = old.id; -- só p/ mensagem
      raise exception 'Banco % não pode ser excluído: a questão % (entre outras) está em uso: %.',
        old.id, q, array_to_string(v, ', ')
        using errcode = 'restrict_violation';
    end if;
  end loop;
  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_pasta_bloqueia_delete on public.simulado_pastas;
create trigger trg_pasta_bloqueia_delete
  before delete on public.simulado_pastas
  for each row execute function public.trg_bloqueia_pasta_com_vinculos();

drop trigger if exists trg_pasta_bloqueia_softdelete on public.simulado_pastas;
create trigger trg_pasta_bloqueia_softdelete
  before update of deletado on public.simulado_pastas
  for each row
  when (new.deletado is true and old.deletado is distinct from true)
  execute function public.trg_bloqueia_pasta_com_vinculos();
