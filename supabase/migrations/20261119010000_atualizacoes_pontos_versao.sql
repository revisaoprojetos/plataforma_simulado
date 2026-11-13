-- REGISTRO DE ATUALIZAÇÕES / PONTOS DE VERSÃO de materiais. ADITIVA e IDEMPOTENTE.
-- NÃO aplicar automaticamente: revisar e rodar no SQL Editor (termina com NOTIFY pgrst).
--
-- Estende public.simulado_conteudo_atualizacoes (criada em 20261112010000) para que o PROFESSOR registre, por
-- documento (ou por vários de uma vez = lote), um "ponto de versão" escrito à mão: rótulo (ex.: "v2.1"), lista de
-- alterações (itens), data/hora exibida ao aluno (ocorrida_em) e estado (rascunho/publicado), independente do "salvar"
-- do editor. Registros antigos continuam válidos (defaults: publicado, visível, ocorrida_em = criado_em).
--
-- A flag por tenant "registro de versões como fonte de publicação" NÃO precisa de coluna: vive em
-- simulado_tenants.tema (jsonb) na chave `registro_versoes_ativo` (mesma config "Avançado" do Console, ex.:
-- `leitor_ocultar_legenda_grifos`). Padrão ausente = false (comportamento atual do editor, inalterado).

-- 1) Colunas novas ---------------------------------------------------------------------------------------------------
alter table public.simulado_conteudo_atualizacoes add column if not exists lote_id        uuid;           -- agrupa registros feitos numa multisseleção
alter table public.simulado_conteudo_atualizacoes add column if not exists produto_id     uuid;           -- contexto: registro feito a partir de um Produto (Estúdio)
alter table public.simulado_conteudo_atualizacoes add column if not exists rotulo         text;           -- "v2.1" / "Atualização de Nov/2026"
alter table public.simulado_conteudo_atualizacoes add column if not exists itens          jsonb not null default '[]'::jsonb;  -- [{texto, tipo?, local?}]
alter table public.simulado_conteudo_atualizacoes add column if not exists status         text not null default 'publicado';
alter table public.simulado_conteudo_atualizacoes add column if not exists visivel_aluno  boolean not null default true;
alter table public.simulado_conteudo_atualizacoes add column if not exists publicado_em   timestamptz;
alter table public.simulado_conteudo_atualizacoes add column if not exists atualizado_em  timestamptz;
alter table public.simulado_conteudo_atualizacoes add column if not exists atualizado_por uuid;
alter table public.simulado_conteudo_atualizacoes add column if not exists deletado       boolean not null default false;
alter table public.simulado_conteudo_atualizacoes add column if not exists deletado_em    timestamptz;
alter table public.simulado_conteudo_atualizacoes add column if not exists deletado_por   uuid;

-- ocorrida_em: criada SEM default, preenchida com criado_em nos registros antigos (só na 1ª execução) e depois com default now().
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='simulado_conteudo_atualizacoes' and column_name='ocorrida_em') then
    alter table public.simulado_conteudo_atualizacoes add column ocorrida_em timestamptz;
    update public.simulado_conteudo_atualizacoes set ocorrida_em = criado_em where ocorrida_em is null;
    alter table public.simulado_conteudo_atualizacoes alter column ocorrida_em set default now();
    alter table public.simulado_conteudo_atualizacoes alter column ocorrida_em set not null;
    update public.simulado_conteudo_atualizacoes set publicado_em = criado_em where publicado_em is null;
  end if;
end $$;

-- 2) Constraints -----------------------------------------------------------------------------------------------------
do $$
begin
  -- `texto` vira RESUMO opcional quando há itens: tira o "1..2000" e exige "texto OU itens".
  if exists (select 1 from pg_constraint where conrelid='public.simulado_conteudo_atualizacoes'::regclass and conname='simulado_conteudo_atualizacoes_texto_check') then
    alter table public.simulado_conteudo_atualizacoes drop constraint simulado_conteudo_atualizacoes_texto_check;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.simulado_conteudo_atualizacoes'::regclass and conname='cont_atualiz_texto_len') then
    alter table public.simulado_conteudo_atualizacoes add constraint cont_atualiz_texto_len check (char_length(texto) <= 2000);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.simulado_conteudo_atualizacoes'::regclass and conname='cont_atualiz_texto_ou_itens') then
    alter table public.simulado_conteudo_atualizacoes add constraint cont_atualiz_texto_ou_itens
      check (char_length(btrim(texto)) > 0 or (jsonb_typeof(itens) = 'array' and jsonb_array_length(itens) > 0)) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.simulado_conteudo_atualizacoes'::regclass and conname='cont_atualiz_status') then
    alter table public.simulado_conteudo_atualizacoes add constraint cont_atualiz_status check (status in ('rascunho','publicado'));
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.simulado_conteudo_atualizacoes'::regclass and conname='cont_atualiz_itens_array') then
    alter table public.simulado_conteudo_atualizacoes add constraint cont_atualiz_itens_array check (jsonb_typeof(itens) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.simulado_conteudo_atualizacoes'::regclass and conname='cont_atualiz_rotulo_len') then
    alter table public.simulado_conteudo_atualizacoes add constraint cont_atualiz_rotulo_len check (rotulo is null or char_length(rotulo) <= 120);
  end if;
end $$;

-- 3) Índices ---------------------------------------------------------------------------------------------------------
create index if not exists idx_cont_atualiz_doc_ocorrida   on public.simulado_conteudo_atualizacoes (tenant_id, documento_id, ocorrida_em desc);
create index if not exists idx_cont_atualiz_produto        on public.simulado_conteudo_atualizacoes (tenant_id, produto_id) where produto_id is not null;
create index if not exists idx_cont_atualiz_lote           on public.simulado_conteudo_atualizacoes (tenant_id, lote_id) where lote_id is not null;
create index if not exists idx_cont_atualiz_publicadas     on public.simulado_conteudo_atualizacoes (tenant_id, ocorrida_em desc, id) where status = 'publicado' and visivel_aluno and not deletado;

notify pgrst, 'reload schema';
