-- 21 — REVERTE o SQL 20 (provider volta ao valor anterior, a partir do backup). Idempotente.
UPDATE public.simulado_arquivos a
   SET provider = b.valor_antes
  FROM public.storage_url_backup_20261127 b
 WHERE b.tabela = 'simulado_arquivos' AND b.coluna = 'provider' AND b.id = a.id::text;

NOTIFY pgrst, 'reload schema';
