-- No banco twdr (migrado) a coluna `deletado` NÃO tinha DEFAULT → todo INSERT novo vinha com
-- deletado=NULL → o registro ficava INVISÍVEL (as listagens filtram `deletado = false`).
-- Isso quebrava: criar banco/grupo/questão pelo app, o import Curseduca ("novo grupo") e
-- deixou as questões migradas invisíveis. Este SQL, para TODA tabela simulado_* que tem a
-- coluna `deletado`: define DEFAULT false + faz backfill dos NULL existentes. Idempotente.
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT table_name FROM information_schema.columns
    WHERE table_schema = 'public' AND column_name = 'deletado' AND table_name LIKE 'simulado_%'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN deletado SET DEFAULT false', t);
    EXECUTE format('UPDATE public.%I SET deletado = false WHERE deletado IS NULL', t);
    RAISE NOTICE 'deletado corrigido: %', t;
  END LOOP;
END $$;

-- Recarrega o schema cache do PostgREST.
NOTIFY pgrst, 'reload schema';
