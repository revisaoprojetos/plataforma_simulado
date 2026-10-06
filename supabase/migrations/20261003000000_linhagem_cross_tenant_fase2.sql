-- Compartilhamento CROSS-TENANT — FASE 2 (linhagem p/ TODO conteúdo compartilhável).
-- Estende o modelo cópia+linhagem (ver 20260929000004 + docs/compartilhamento-conteudo-cross-tenant.md)
-- para SIMULADOS, PASTAS (banco/leitura/jurisprudência), DOCUMENTOS (aulas de leitura) e CADERNOS.
-- Cada tenant continua DONO da sua cópia (tenant_id próprio) → RLS INALTERADA, aluno nunca percebe.
-- Só adiciona colunas NULÁVEIS + índices (idempotente). ⚠️ Aplicação MANUAL no SQL Editor (padrão do projeto).
-- ANTI-EGRESS: imagens/áudio NÃO são copiados — a cópia referencia a MESMA URL do storage compartilhado.

-- Helper mental: linhagem_id = identidade comum entre plataformas; origem_tenant_id = quem criou primeiro.

-- ── simulado_simulados ─────────────────────────────────────────────────────────
ALTER TABLE public.simulado_simulados ADD COLUMN IF NOT EXISTS linhagem_id uuid;
ALTER TABLE public.simulado_simulados ADD COLUMN IF NOT EXISTS origem_tenant_id uuid;
UPDATE public.simulado_simulados SET linhagem_id = gen_random_uuid() WHERE linhagem_id IS NULL;
UPDATE public.simulado_simulados SET origem_tenant_id = tenant_id     WHERE origem_tenant_id IS NULL;
ALTER TABLE public.simulado_simulados ALTER COLUMN linhagem_id SET DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_simulados_linhagem        ON public.simulado_simulados (linhagem_id);
CREATE INDEX IF NOT EXISTS idx_simulados_tenant_linhagem ON public.simulado_simulados (tenant_id, linhagem_id);

-- ── simulado_pastas (banco de questões, módulos de leitura, desafios de jurisprudência) ──
ALTER TABLE public.simulado_pastas ADD COLUMN IF NOT EXISTS linhagem_id uuid;
ALTER TABLE public.simulado_pastas ADD COLUMN IF NOT EXISTS origem_tenant_id uuid;
UPDATE public.simulado_pastas SET linhagem_id = gen_random_uuid() WHERE linhagem_id IS NULL;
UPDATE public.simulado_pastas SET origem_tenant_id = tenant_id     WHERE origem_tenant_id IS NULL;
ALTER TABLE public.simulado_pastas ALTER COLUMN linhagem_id SET DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_pastas_linhagem        ON public.simulado_pastas (linhagem_id);
CREATE INDEX IF NOT EXISTS idx_pastas_tenant_linhagem ON public.simulado_pastas (tenant_id, linhagem_id);

-- ── simulado_documentos (aulas de leitura / LegProc) ────────────────────────────
ALTER TABLE public.simulado_documentos ADD COLUMN IF NOT EXISTS linhagem_id uuid;
ALTER TABLE public.simulado_documentos ADD COLUMN IF NOT EXISTS origem_tenant_id uuid;
UPDATE public.simulado_documentos SET linhagem_id = gen_random_uuid() WHERE linhagem_id IS NULL;
UPDATE public.simulado_documentos SET origem_tenant_id = tenant_id     WHERE origem_tenant_id IS NULL;
ALTER TABLE public.simulado_documentos ALTER COLUMN linhagem_id SET DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_documentos_linhagem        ON public.simulado_documentos (linhagem_id);
CREATE INDEX IF NOT EXISTS idx_documentos_tenant_linhagem ON public.simulado_documentos (tenant_id, linhagem_id);

-- ── simulado_cadernos_designer ──────────────────────────────────────────────────
ALTER TABLE public.simulado_cadernos_designer ADD COLUMN IF NOT EXISTS linhagem_id uuid;
ALTER TABLE public.simulado_cadernos_designer ADD COLUMN IF NOT EXISTS origem_tenant_id uuid;
UPDATE public.simulado_cadernos_designer SET linhagem_id = gen_random_uuid() WHERE linhagem_id IS NULL;
UPDATE public.simulado_cadernos_designer SET origem_tenant_id = tenant_id     WHERE origem_tenant_id IS NULL;
ALTER TABLE public.simulado_cadernos_designer ALTER COLUMN linhagem_id SET DEFAULT gen_random_uuid();
CREATE INDEX IF NOT EXISTS idx_cadernos_linhagem        ON public.simulado_cadernos_designer (linhagem_id);
CREATE INDEX IF NOT EXISTS idx_cadernos_tenant_linhagem ON public.simulado_cadernos_designer (tenant_id, linhagem_id);
