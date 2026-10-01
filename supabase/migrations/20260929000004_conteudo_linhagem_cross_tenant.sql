-- Compartilhamento de conteúdo CROSS-TENANT (modelo cópia + linhagem) — FASE 1 (fundação).
-- Cada conteúdo compartilhável ganha uma "linhagem" (identidade comum entre plataformas) + a plataforma
-- de origem. Cada tenant continua DONO da sua cópia (tenant_id = atual) → RLS INALTERADA, aluno nunca
-- percebe. Esta fase cobre QUESTÕES (+ alternativas). Idempotente. Ver docs/compartilhamento-conteudo-cross-tenant.md
-- ⚠️ Aplicação MANUAL no SQL Editor (padrão do projeto). Não afeta o aluno (só adiciona colunas/índices).

-- ── simulado_questoes ─────────────────────────────────────────────────────────
ALTER TABLE public.simulado_questoes ADD COLUMN IF NOT EXISTS linhagem_id uuid;
ALTER TABLE public.simulado_questoes ADD COLUMN IF NOT EXISTS origem_tenant_id uuid;
ALTER TABLE public.simulado_questoes ADD COLUMN IF NOT EXISTS linhagem_divergente boolean NOT NULL DEFAULT false;

-- Backfill: cada questão existente é a própria linhagem, originada no próprio tenant.
UPDATE public.simulado_questoes SET linhagem_id = gen_random_uuid() WHERE linhagem_id IS NULL;
UPDATE public.simulado_questoes SET origem_tenant_id = tenant_id     WHERE origem_tenant_id IS NULL;

-- Novas linhas nativas já nascem com linhagem (o app também seta explicitamente).
ALTER TABLE public.simulado_questoes ALTER COLUMN linhagem_id SET DEFAULT gen_random_uuid();

-- ── simulado_alternativas ─────────────────────────────────────────────────────
-- Alternativa recebe linhagem própria; ao COPIAR uma questão, a cópia preserva o linhagem_id da
-- alternativa de origem → a propagação (F3) casa alternativa-a-alternativa por linhagem.
ALTER TABLE public.simulado_alternativas ADD COLUMN IF NOT EXISTS linhagem_id uuid;
UPDATE public.simulado_alternativas SET linhagem_id = gen_random_uuid() WHERE linhagem_id IS NULL;
ALTER TABLE public.simulado_alternativas ALTER COLUMN linhagem_id SET DEFAULT gen_random_uuid();

-- ── Índices (achar irmãs por linhagem, listar por tenant, filtrar por origem) ──
CREATE INDEX IF NOT EXISTS idx_questoes_linhagem        ON public.simulado_questoes (linhagem_id);
CREATE INDEX IF NOT EXISTS idx_questoes_tenant_linhagem ON public.simulado_questoes (tenant_id, linhagem_id);
CREATE INDEX IF NOT EXISTS idx_questoes_origem          ON public.simulado_questoes (origem_tenant_id);
CREATE INDEX IF NOT EXISTS idx_alternativas_linhagem    ON public.simulado_alternativas (linhagem_id);
