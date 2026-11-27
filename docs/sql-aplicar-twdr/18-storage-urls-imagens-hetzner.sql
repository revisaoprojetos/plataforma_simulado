-- 18 — Reescreve as URLs ABSOLUTAS do bucket PÚBLICO `imagens` (Supabase) para o Hetzner. Idempotente. Cole no SQL Editor.
-- ANTES de rodar: o bucket `revisaopge-imagens` do Hetzner precisa estar com leitura pública (hoje devolve 403 anônimo).
--   Rode (de apps/web):  node scripts/storage-publicar-imagens.mjs        (aplica bucket policy GetObject público SÓ no bucket imagens)
--   Confirme:            curl -sI https://hel1.your-objectstorage.com/revisaopge-imagens/assets/e7d52d98351e5cf1892aca6a.webp   → 200
--   Se NÃO der 200, NÃO aplique este SQL (as imagens deixariam de abrir).
-- Escopo: só `.../storage/v1/object/public/imagens/` → `https://hel1.your-objectstorage.com/revisaopge-imagens/`
--   simulado_questoes.imagem_url, simulado_pastas.capa_url/capa_card_url, simulado_banners.imagem_url, simulado_tenants.tema (jsonb).
-- NÃO toca em URLs do bucket `pdfs` (privado; são só localizadores resolvidos por /api/arquivo/pdf → storage ativo) nem em
--   simulado_pastas.caderno_entrega / simulado_pdf_jobs.arquivo_url (todas `pdfs`).
-- Reversível: valores originais em public.storage_url_backup_20261127 (SQL 19 reverte). Não apaga nada no storage.

CREATE TABLE IF NOT EXISTS public.storage_url_backup_20261127 (
  tabela      text NOT NULL,
  id          text NOT NULL,
  coluna      text NOT NULL,
  valor_antes text,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tabela, id, coluna)
);
ALTER TABLE public.storage_url_backup_20261127 ENABLE ROW LEVEL SECURITY; -- sem policy = só service role/postgres

DO $$
DECLARE
  antes  constant text := 'https://twdrtlxkjvunkdobudev.supabase.co/storage/v1/object/public/imagens/';
  depois constant text := 'https://hel1.your-objectstorage.com/revisaopge-imagens/';
  r record;
  n bigint;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('simulado_questoes', 'imagem_url',    'text'),
    ('simulado_pastas',   'capa_url',      'text'),
    ('simulado_pastas',   'capa_card_url', 'text'),
    ('simulado_banners',  'imagem_url',    'text'),
    ('simulado_tenants',  'tema',          'jsonb')
  ) AS v(tabela, coluna, tipo)
  LOOP
    -- 1) backup do valor ORIGINAL (só linhas que serão alteradas; não sobrescreve backup anterior)
    EXECUTE format(
      'INSERT INTO public.storage_url_backup_20261127 (tabela, id, coluna, valor_antes)
         SELECT %L, id::text, %L, %I::text FROM public.%I WHERE %I::text LIKE %L
       ON CONFLICT (tabela, id, coluna) DO NOTHING',
      r.tabela, r.coluna, r.coluna, r.tabela, r.coluna, '%' || antes || '%');
    -- 2) reescreve
    IF r.tipo = 'jsonb' THEN
      EXECUTE format('UPDATE public.%I SET %I = replace(%I::text, %L, %L)::jsonb WHERE %I::text LIKE %L',
        r.tabela, r.coluna, r.coluna, antes, depois, r.coluna, '%' || antes || '%');
    ELSE
      EXECUTE format('UPDATE public.%I SET %I = replace(%I, %L, %L) WHERE %I LIKE %L',
        r.tabela, r.coluna, r.coluna, antes, depois, r.coluna, '%' || antes || '%');
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '% . % : % linhas reescritas', r.tabela, r.coluna, n;
  END LOOP;
END $$;

-- Conferir (deve retornar 0 em todas = nenhuma URL do bucket imagens do Supabase restante):
-- select
--   (select count(*) from simulado_questoes where imagem_url like '%/storage/v1/object/public/imagens/%') q,
--   (select count(*) from simulado_pastas   where capa_url like '%/storage/v1/object/public/imagens/%' or capa_card_url like '%/storage/v1/object/public/imagens/%') p,
--   (select count(*) from simulado_banners  where imagem_url like '%/storage/v1/object/public/imagens/%') b,
--   (select count(*) from simulado_tenants  where tema::text like '%/storage/v1/object/public/imagens/%') t;
-- Backup gravado: select tabela, coluna, count(*) from public.storage_url_backup_20261127 group by 1,2;

NOTIFY pgrst, 'reload schema';
