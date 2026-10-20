-- ============================================================================
-- Biblioteca de Conteúdos (Drive jurídico) — FASE 0: Fundação do schema.
-- Modelo corrigido da auditoria (docs/ANALISE-PLATAFORMA-CONTEUDO-JURIDICO.md):
--   documento-mãe → versões imutáveis → trechos com identidade estável (uid)
--   → vínculos (produto) → desafios/regras → camada do aluno (anotações/avisos)
--   + outbox (entrega confiável) + idempotência.
-- Convenções do repo: tabelas public.simulado_conteudo_*, tenant_id em TUDO (N1),
-- RLS LIGADO SEM políticas (só service role lê/escreve; a app filtra tenant_id),
-- soft-delete, pastas reusam simulado_pastas (folder_area='conteudo'). Aplicação
-- MANUAL e idempotente. NÃO toca em nada que já roda (aditivo/isolado).
-- ----------------------------------------------------------------------------
-- NB sobre nomes: já existe simulado_biblioteca_itens (blocos HTML do Desafio,
-- folder_area='biblioteca'). Este módulo é OUTRO (conteúdo de leitura versionado)
-- → prefixo simulado_conteudo_* + folder_area='conteudo' para não colidir.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────── DRIVE (Fase 1)
-- Documento-mãe. A FK circular com versões (versao_atual_id) é adicionada no fim (A4).
create table if not exists public.simulado_conteudo_documentos (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null,
  pasta_id        uuid,                                   -- simulado_pastas (folder_area='conteudo'); null = raiz
  titulo          text not null,
  tipo_origem     text not null check (tipo_origem in ('docx','pdf','html')),
  status          text not null default 'rascunho' check (status in ('rascunho','publicado','arquivado')),
  versao_atual_id uuid,                                   -- FK → versoes (adicionada no fim)
  fonte           text,                                   -- P1/D8: origem do conteúdo (de quem é)
  licenca         text,                                   -- P1/D8: licença/autorização (próprio|licenciado|…)
  criado_por      uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  deletado        boolean not null default false,
  deletado_em     timestamptz,
  deletado_por    uuid
);
create index if not exists idx_conteudo_doc_tenant ON public.simulado_conteudo_documentos (tenant_id, status) where deletado = false;
create index if not exists idx_conteudo_doc_pasta  ON public.simulado_conteudo_documentos (pasta_id);

-- Versão imutável do documento (R1). vigencia_* = P3 (vigência jurídica como requisito).
create table if not exists public.simulado_conteudo_versoes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  documento_id     uuid not null references public.simulado_conteudo_documentos(id) on delete cascade,
  numero           int not null,
  arquivo_key      text not null default '',              -- chave no storage (o .docx/pdf/html original — fonte de edição, N8)
  hash_arquivo     text not null default '',
  origem           text not null check (origem in ('upload','edicao_editor','restauracao')),
  status_conversao text not null default 'pendente' check (status_conversao in ('pendente','processando','ok','revisao_necessaria','erro')),
  vigencia_inicio  date,                                  -- P3
  vigencia_fim     date,                                  -- P3 (null = vigente)
  criada_por       uuid,
  criada_em        timestamptz not null default now(),
  unique (documento_id, numero)
);
create index if not exists idx_conteudo_ver_doc ON public.simulado_conteudo_versoes (documento_id, numero desc);

-- FK circular agora que versoes existe (A4) — idempotente.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'simulado_conteudo_doc_versao_atual_fk') then
    alter table public.simulado_conteudo_documentos
      add constraint simulado_conteudo_doc_versao_atual_fk
      foreign key (versao_atual_id) references public.simulado_conteudo_versoes(id) on delete set null;
  end if;
end $$;

-- ─────────────────────────────────────────────── ESTRUTURA / uid (Fase 2)
-- Identidade ESTÁVEL do trecho entre versões (A1/A2/R5). O uid é a âncora de
-- anotações e regras; vive aqui, não em `trechos` (que repete por versão).
create table if not exists public.simulado_conteudo_trecho_identidade (
  uid          uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null,
  documento_id uuid not null references public.simulado_conteudo_documentos(id) on delete cascade
);
create index if not exists idx_conteudo_trid_doc ON public.simulado_conteudo_trecho_identidade (documento_id);

-- Trecho estruturado de UMA versão. `uid` liga à identidade; `pai_uid` dá a hierarquia.
create table if not exists public.simulado_conteudo_trechos (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  versao_id  uuid not null references public.simulado_conteudo_versoes(id) on delete cascade,
  uid        uuid not null references public.simulado_conteudo_trecho_identidade(uid) on delete cascade,
  pai_uid    uuid references public.simulado_conteudo_trecho_identidade(uid),
  ordem      int not null,
  tipo       text not null check (tipo in ('titulo','capitulo','artigo','paragrafo','inciso','alinea','texto')),
  rotulo     text,                                        -- "Art. 5º", "§ 1º", "II"
  texto      text not null default '',
  hash_texto text not null default '',                    -- hash do texto normalizado (reconciliação)
  alinhamento_regra text,                                 -- N6: como o uid foi casado (debug/auditoria)
  alinhamento_score numeric,                              -- N6: confiança do alinhamento (fila de revisão se baixa)
  unique (versao_id, uid),
  unique (versao_id, ordem)
);

-- ─────────────────────────────────────────────── VÍNCULOS (Fase 3)
-- Liga o documento-mãe a um produto (curso/trilha/aula/pasta — genérico por tipo+ref),
-- em modo 'ultima' (sempre a atual) ou 'fixada' (versão aprovada). (A3: desafio aponta p/ vínculo.)
create table if not exists public.simulado_conteudo_vinculos (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null,
  documento_id     uuid not null references public.simulado_conteudo_documentos(id) on delete cascade,
  produto_tipo     text not null,                         -- 'curso'|'trilha'|'aula'|'pasta'|…
  produto_ref_id   uuid not null,
  modo             text not null check (modo in ('ultima','fixada')),
  versao_fixada_id uuid references public.simulado_conteudo_versoes(id) on delete restrict,
  ordem            int not null default 0,
  criado_em        timestamptz not null default now(),
  unique (documento_id, produto_tipo, produto_ref_id),
  check ((modo = 'fixada') = (versao_fixada_id is not null))
);
create index if not exists idx_conteudo_vinc_doc ON public.simulado_conteudo_vinculos (documento_id);
create index if not exists idx_conteudo_vinc_prod ON public.simulado_conteudo_vinculos (produto_tipo, produto_ref_id);

-- ─────────────────────────────────────────────── DESAFIOS (Fase 5)
create table if not exists public.simulado_conteudo_desafios (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null,
  vinculo_id uuid not null references public.simulado_conteudo_vinculos(id) on delete cascade,  -- A3
  titulo     text not null,
  criado_por uuid,
  criado_em  timestamptz not null default now()
);
create index if not exists idx_conteudo_desafio_vinc ON public.simulado_conteudo_desafios (vinculo_id);

-- Regra de recorte/ocultar/lacuna. `gabarito` NUNCA vai ao cliente (R3/A7). `estado` + `texto_ancora`
-- permitem revalidar a regra a cada versão (A5).
create table if not exists public.simulado_conteudo_regras (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  desafio_id         uuid not null references public.simulado_conteudo_desafios(id) on delete cascade,
  acao               text not null check (acao in ('recortar','ocultar','lacuna')),
  trecho_uid_inicio  uuid not null references public.simulado_conteudo_trecho_identidade(uid),
  trecho_uid_fim     uuid references public.simulado_conteudo_trecho_identidade(uid),
  inicio_offset      int,
  fim_offset         int,
  texto_ancora       text,                                -- A5: regra também sobrevive à atualização
  gabarito           text,                                -- só 'lacuna'; server-only (nunca no payload do aluno)
  estado             text not null default 'ativa' check (estado in ('ativa','invalida')),
  criado_em          timestamptz not null default now()
);
create index if not exists idx_conteudo_regra_desafio ON public.simulado_conteudo_regras (desafio_id);

-- ─────────────────────────────────────────────── CAMADA DO ALUNO (Fase 6)
-- Anotação ancorada ao documento+uid (serve Biblioteca E Desafio — camada unificada).
-- NUNCA é apagada por atualização (R4): vira 'alterada' (aviso) ou 'orfa' (pendência).
create table if not exists public.simulado_conteudo_anotacoes (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null,
  aluno_id           uuid not null,
  documento_id       uuid not null references public.simulado_conteudo_documentos(id) on delete cascade,
  trecho_uid         uuid not null references public.simulado_conteudo_trecho_identidade(uid) on delete cascade,
  tipo               text not null check (tipo in ('destaque','nota','riscado','insercao')),
  inicio_offset      int not null default 0,
  fim_offset         int not null default 0,
  texto_ancora       text not null default '',            -- texto exato marcado
  contexto_antes     text,
  contexto_depois    text,
  conteudo           jsonb,                                -- cor, texto da nota, texto inserido
  versao_criada_id   uuid references public.simulado_conteudo_versoes(id) on delete set null,
  versao_validada_id uuid references public.simulado_conteudo_versoes(id) on delete set null,
  estado             text not null default 'ativa' check (estado in ('ativa','alterada','orfa')),
  criada_em          timestamptz not null default now(),
  atualizada_em      timestamptz not null default now()
);
create index if not exists idx_conteudo_anot_aluno_doc ON public.simulado_conteudo_anotacoes (aluno_id, documento_id);
create index if not exists idx_conteudo_anot_uid ON public.simulado_conteudo_anotacoes (trecho_uid);

-- Aviso de trecho alterado (idempotente por UNIQUE — reconciliar de novo não duplica).
create table if not exists public.simulado_conteudo_avisos (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null,
  anotacao_id    uuid not null references public.simulado_conteudo_anotacoes(id) on delete cascade,
  versao_de_id   uuid references public.simulado_conteudo_versoes(id) on delete set null,
  versao_para_id uuid references public.simulado_conteudo_versoes(id) on delete set null,
  trecho_antes   text,
  trecho_depois  text,
  status         text not null default 'pendente' check (status in ('pendente','visto','resolvido')),
  criado_em      timestamptz not null default now(),
  unique (anotacao_id, versao_para_id)
);

-- Histórico de leitura (N15): o que o aluno leu, pela Biblioteca OU por um desafio.
create table if not exists public.simulado_conteudo_leitura_progresso (
  tenant_id       uuid not null,
  aluno_id        uuid not null,
  documento_id    uuid not null references public.simulado_conteudo_documentos(id) on delete cascade,
  versao_id       uuid references public.simulado_conteudo_versoes(id) on delete set null,
  origem          text not null default 'biblioteca' check (origem in ('biblioteca','desafio')),
  ultima_leitura_em timestamptz not null default now(),
  posicao         jsonb,
  primary key (tenant_id, aluno_id, documento_id)
);

-- ─────────────────────────────────────────────── INFRA (Fase 0)
-- Outbox (A6): o evento é gravado na MESMA transação da mutação; o worker drena.
create table if not exists public.simulado_conteudo_outbox (
  id           bigserial primary key,
  tenant_id    uuid not null,
  tipo         text not null,                             -- documento.importado | documento.atualizado | anotacao.reconciliar | aviso.criado
  payload      jsonb not null default '{}'::jsonb,
  criado_em    timestamptz not null default now(),
  processado_em timestamptz
);
create index if not exists idx_conteudo_outbox_pendente ON public.simulado_conteudo_outbox (criado_em) where processado_em is null;

-- Idempotência (N11): janela p/ POST de versão/reconciliação não duplicar.
create table if not exists public.simulado_conteudo_idempotencia (
  tenant_id     uuid not null,
  chave         text not null,
  rota          text not null,
  resposta_hash text,
  criado_em     timestamptz not null default now(),
  primary key (tenant_id, chave)
);

-- ─────────────────────────────────────────────── RLS (N1): ligado SEM políticas.
-- Só o service role (createAdminClient) lê/escreve; a app filtra tenant_id. Nenhum
-- cliente anon/auth acessa direto → isolamento multi-tenant garantido.
alter table public.simulado_conteudo_documentos        enable row level security;
alter table public.simulado_conteudo_versoes           enable row level security;
alter table public.simulado_conteudo_trecho_identidade enable row level security;
alter table public.simulado_conteudo_trechos           enable row level security;
alter table public.simulado_conteudo_vinculos          enable row level security;
alter table public.simulado_conteudo_desafios          enable row level security;
alter table public.simulado_conteudo_regras            enable row level security;
alter table public.simulado_conteudo_anotacoes         enable row level security;
alter table public.simulado_conteudo_avisos            enable row level security;
alter table public.simulado_conteudo_leitura_progresso enable row level security;
alter table public.simulado_conteudo_outbox            enable row level security;
alter table public.simulado_conteudo_idempotencia      enable row level security;

notify pgrst, 'reload schema';
