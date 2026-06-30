-- =========================================================
-- SOFT DELETE + LIXEIRA — entidades núcleo (multi-tenant)
-- Adiciona deletado/deletado_em/deletado_por nas 8 entidades.
-- App (server actions, service-role) faz UPDATE deletado=true e passa deletado_por;
-- o trigger carimba deletado_em e LIMPA tudo ao restaurar.
-- Ligações (questao_pasta, grupo_membros, alternativas…) e matriculas seguem hard delete.
-- NÃO mexe em mentoria_* (outro produto). Idempotente.
-- =========================================================

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_questoes','simulado_simulados','simulado_estudantes','simulado_grupos',
    'simulado_pastas','simulado_cadernos_designer','simulado_etiquetas','simulado_sessoes_prova'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I
      ADD COLUMN IF NOT EXISTS deletado boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS deletado_em timestamptz,
      ADD COLUMN IF NOT EXISTS deletado_por uuid', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_ativo ON public.%I (deletado) WHERE deletado = false', t, t);
  END LOOP;
END $$;

-- Carimbo: ao marcar deletado=true grava deletado_em (se vazio); ao restaurar limpa em/por.
CREATE OR REPLACE FUNCTION public.simulado_soft_delete_stamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.deletado IS TRUE AND OLD.deletado IS DISTINCT FROM TRUE THEN
    NEW.deletado_em := COALESCE(NEW.deletado_em, now());
  ELSIF NEW.deletado IS NOT TRUE AND OLD.deletado IS TRUE THEN
    NEW.deletado_em := NULL;
    NEW.deletado_por := NULL;
  END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'simulado_questoes','simulado_simulados','simulado_estudantes','simulado_grupos',
    'simulado_pastas','simulado_cadernos_designer','simulado_etiquetas','simulado_sessoes_prova'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_soft_delete ON public.%I', t);
    EXECUTE format('CREATE TRIGGER trg_soft_delete BEFORE UPDATE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.simulado_soft_delete_stamp()', t);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
