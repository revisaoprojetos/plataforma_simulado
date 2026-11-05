-- QUESTÕES › novo FORMATO da Biblioteca. O card "Questões" é um DOCUMENTO da Biblioteca
-- (simulado_conteudo_documentos) com tipo_origem='questoes' — sem arquivo/versão — então ele JÁ
-- aparece no grid e HERDA pasta/acesso/status/soft-delete do resto da Biblioteca (máximo reuso).
-- O conteúdo (as questões) vive numa tabela de vínculo para o BANCO (simulado_questoes): preenchível
-- por import de planilha (confirmarImportQuestoes) OU adicionando do banco — igual ao simulado.
--
-- NÃO aplicar automaticamente. Aplicar manualmente e rodar: NOTIFY pgrst, 'reload schema';

-- ─────────── 1) Ampliar o CHECK de tipo_origem para aceitar 'questoes' ───────────
-- (mesmo padrão idempotente da 20261031120000_conteudo_tipo_origem_midia.sql)
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'simulado_conteudo_documentos'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%tipo_origem%'
  LOOP
    EXECUTE format('ALTER TABLE simulado_conteudo_documentos DROP CONSTRAINT %I', r.conname);
  END LOOP;

  ALTER TABLE simulado_conteudo_documentos
    ADD CONSTRAINT chk_cdoc_tipo_origem
    CHECK (tipo_origem IS NULL OR tipo_origem IN ('docx','pdf','html','pptx','xlsx','video','audio','questoes'));
END $$;

-- ─────────── 2) Vínculo documento-questões → banco (simulado_questoes) ───────────
-- Uma questão pode estar em vários cards; o card pode referenciar a mesma questão uma vez.
create table if not exists simulado_conteudo_quiz_questoes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null,
  documento_id  uuid not null references simulado_conteudo_documentos(id) on delete cascade,
  questao_id    uuid not null references simulado_questoes(id) on delete cascade,
  ordem         integer not null default 0,
  criado_em     timestamptz not null default now(),
  unique (documento_id, questao_id)
);

create index if not exists idx_cquiz_doc on simulado_conteudo_quiz_questoes (tenant_id, documento_id, ordem);

alter table simulado_conteudo_quiz_questoes enable row level security;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='simulado_conteudo_quiz_questoes' and policyname='cquiz_tenant') then
    create policy cquiz_tenant on simulado_conteudo_quiz_questoes
      using (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
  end if;
end $$;

-- PostgREST: recarregar o schema cache.
notify pgrst, 'reload schema';
