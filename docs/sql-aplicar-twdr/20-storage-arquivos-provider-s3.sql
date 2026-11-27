-- 20 — simulado_arquivos.provider: 'supabase' → 's3' (rótulo informativo; o app NÃO usa a coluna p/ decidir onde ler).
-- Verificado em 2026-11-27 (leitura): as 15.736 linhas com provider='supabase' (buckets pdfs/imagens/discursivas) têm o
-- objeto presente no Hetzner (ListObjectsV2: 18.619 objetos; 0 linhas sem objeto). Idempotente; backup em
-- public.storage_url_backup_20261127 (coluna='provider'). Reversão: SQL 21.

CREATE TABLE IF NOT EXISTS public.storage_url_backup_20261127 (
  tabela      text NOT NULL,
  id          text NOT NULL,
  coluna      text NOT NULL,
  valor_antes text,
  criado_em   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tabela, id, coluna)
);
ALTER TABLE public.storage_url_backup_20261127 ENABLE ROW LEVEL SECURITY;

INSERT INTO public.storage_url_backup_20261127 (tabela, id, coluna, valor_antes)
SELECT 'simulado_arquivos', id::text, 'provider', provider
  FROM public.simulado_arquivos WHERE provider = 'supabase'
ON CONFLICT (tabela, id, coluna) DO NOTHING;

UPDATE public.simulado_arquivos SET provider = 's3' WHERE provider = 'supabase';

-- Conferir: select provider, count(*) from public.simulado_arquivos group by 1;   → s3 = 15736 (+ novos)

NOTIFY pgrst, 'reload schema';
