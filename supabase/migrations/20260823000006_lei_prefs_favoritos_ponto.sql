-- ═══════════════════════════════════════════════════════════════════════════
-- Lei Seca — Fase A / A6: estudo pessoal — PREFERÊNCIAS + ÚLTIMO PONTO + FAVORITOS.
-- ═══════════════════════════════════════════════════════════════════════════

-- Preferências de leitura por usuário (acompanham entre sessões/dispositivos)
CREATE TABLE IF NOT EXISTS public.simulado_leitura_preferencias (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  tema          text,
  fonte         integer,
  espacamento   text,
  largura       text,
  sem_grifos    boolean,
  painel        text,
  modo          text,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estudante_id)
);

-- Último ponto lido por lei (retomar de onde parou)
CREATE TABLE IF NOT EXISTS public.simulado_leitura_ultimo_ponto (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  documento_id  uuid NOT NULL,
  disp_id       text,
  versao        integer,
  atualizado_em timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estudante_id, documento_id)
);

-- Favoritos de lei/dispositivo (disp_id '' = a lei inteira)
CREATE TABLE IF NOT EXISTS public.simulado_lei_favoritos (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id     uuid NOT NULL,
  estudante_id  uuid NOT NULL,
  documento_id  uuid NOT NULL,
  disp_id       text NOT NULL DEFAULT '',
  criado_em     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (estudante_id, documento_id, disp_id)
);
CREATE INDEX IF NOT EXISTS idx_simulado_lei_favoritos_est ON public.simulado_lei_favoritos(estudante_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['simulado_leitura_preferencias','simulado_leitura_ultimo_ponto','simulado_lei_favoritos'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%s" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "tenant_isolation_%s" ON public.%I FOR ALL TO authenticated
      USING (tenant_id IN (SELECT public.user_tenant_ids()))
      WITH CHECK (tenant_id IN (SELECT public.user_tenant_ids()))', t, t);
    EXECUTE format('GRANT ALL ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
