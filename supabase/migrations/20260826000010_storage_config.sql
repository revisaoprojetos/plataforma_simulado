-- ═══════════════════════════════════════════════════════════════════════════
-- Área de ARMAZENAMENTO (console super-admin /super/armazenamento).
--
-- Três tabelas de apoio (o storage em si é o Supabase Storage):
--  1. simulado_storage_config  — limite (teto) editável por bucket + global ('*').
--  2. simulado_storage_uso     — cache single-row do snapshot de uso calculado.
--  3. simulado_storage_backups — trilha de backup/reversão de mover/limpar (Fase 3).
--
-- São GLOBAIS (não por tenant): o storage é do projeto inteiro. RLS ligado SEM
-- policy → só o service role (createAdminClient) enxerga; o acesso é gated por
-- isSuperAdmin() no app.
--
-- ⚠️ Aplicar MANUALMENTE no prod (twdr) fora de janela de prova.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.simulado_storage_config (
  bucket         text PRIMARY KEY,          -- nome do bucket, ou '*' para o limite GLOBAL do projeto
  limite_bytes   bigint,                    -- null = sem teto definido
  rotulo         text,                      -- rótulo amigável opcional
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por uuid
);
INSERT INTO public.simulado_storage_config (bucket, limite_bytes)
VALUES ('*', NULL) ON CONFLICT (bucket) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.simulado_storage_uso (
  id            smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- single-row
  snapshot      jsonb NOT NULL DEFAULT '{}'::jsonb,             -- UsoSnapshot serializado
  status        text  NOT NULL DEFAULT 'vazio',                 -- vazio | pendente | ok | erro
  calculado_em  timestamptz,
  erro          text
);
INSERT INTO public.simulado_storage_uso (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.simulado_storage_backups (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo        text NOT NULL,                 -- 'migracao' | 'orfaos' | 'delete'
  criado_em   timestamptz NOT NULL DEFAULT now(),
  criado_por  uuid,
  dados       jsonb NOT NULL DEFAULT '{}'::jsonb  -- { urlsAntes, paths, backupBucketPrefix, resumo }
);
CREATE INDEX IF NOT EXISTS idx_storage_backups_criado ON public.simulado_storage_backups(criado_em DESC);

ALTER TABLE public.simulado_storage_config  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulado_storage_uso     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.simulado_storage_backups ENABLE ROW LEVEL SECURITY;

NOTIFY pgrst, 'reload schema';
