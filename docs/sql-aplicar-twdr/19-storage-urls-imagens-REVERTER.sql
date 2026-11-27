-- 19 — REVERTE o SQL 18 (URLs do bucket imagens voltam ao Supabase), a partir de public.storage_url_backup_20261127. Idempotente.
-- Só restaura as linhas/colunas de URL (coluna <> 'provider'). Não apaga o backup.

DO $$
DECLARE r record; n bigint;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('simulado_questoes', 'imagem_url',    'text'),
    ('simulado_pastas',   'capa_url',      'text'),
    ('simulado_pastas',   'capa_card_url', 'text'),
    ('simulado_banners',  'imagem_url',    'text'),
    ('simulado_tenants',  'tema',          'jsonb')
  ) AS v(tabela, coluna, tipo)
  LOOP
    IF r.tipo = 'jsonb' THEN
      EXECUTE format('UPDATE public.%I t SET %I = b.valor_antes::jsonb FROM public.storage_url_backup_20261127 b
                      WHERE b.tabela = %L AND b.coluna = %L AND b.id = t.id::text', r.tabela, r.coluna, r.tabela, r.coluna);
    ELSE
      EXECUTE format('UPDATE public.%I t SET %I = b.valor_antes FROM public.storage_url_backup_20261127 b
                      WHERE b.tabela = %L AND b.coluna = %L AND b.id = t.id::text', r.tabela, r.coluna, r.tabela, r.coluna);
    END IF;
    GET DIAGNOSTICS n = ROW_COUNT;
    RAISE NOTICE '% . % : % linhas restauradas', r.tabela, r.coluna, n;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
