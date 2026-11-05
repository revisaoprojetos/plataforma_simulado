-- Nome da plataforma (tenant) visível na tabela simulado_disciplinas (Table Editor do Supabase mostra só o UUID em tenant_id).
--  1) coluna `tenant_nome` em simulado_disciplinas, preenchida e MANTIDA por trigger:
--       - ao inserir/alterar uma disciplina, copia o nome da plataforma;
--       - se a plataforma for renomeada, atualiza as disciplinas dela.
--     É só rótulo de leitura: nada no app depende dela (o vínculo continua sendo tenant_id).
--  2) view `simulado_disciplinas_visao`: o mesmo, já ordenada por plataforma e com o nome na 1ª coluna (melhor p/ olhar no Table Editor).
-- Aditiva e idempotente. Aplicação manual no SQL Editor.

ALTER TABLE public.simulado_disciplinas ADD COLUMN IF NOT EXISTS tenant_nome text;

CREATE OR REPLACE FUNCTION public.simulado_disciplinas_set_tenant_nome() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT t.nome INTO NEW.tenant_nome FROM public.simulado_tenants t WHERE t.id = NEW.tenant_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_disciplinas_tenant_nome ON public.simulado_disciplinas;
CREATE TRIGGER trg_disciplinas_tenant_nome
  BEFORE INSERT OR UPDATE OF tenant_id ON public.simulado_disciplinas
  FOR EACH ROW EXECUTE FUNCTION public.simulado_disciplinas_set_tenant_nome();

CREATE OR REPLACE FUNCTION public.simulado_tenants_sync_disciplinas_nome() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.nome IS DISTINCT FROM OLD.nome THEN
    UPDATE public.simulado_disciplinas SET tenant_nome = NEW.nome WHERE tenant_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tenants_sync_disciplinas_nome ON public.simulado_tenants;
CREATE TRIGGER trg_tenants_sync_disciplinas_nome
  AFTER UPDATE OF nome ON public.simulado_tenants
  FOR EACH ROW EXECUTE FUNCTION public.simulado_tenants_sync_disciplinas_nome();

-- preenche as linhas que já existem
UPDATE public.simulado_disciplinas d
   SET tenant_nome = t.nome
  FROM public.simulado_tenants t
 WHERE t.id = d.tenant_id AND d.tenant_nome IS DISTINCT FROM t.nome;

-- visão ordenada (nome da plataforma primeiro)
CREATE OR REPLACE VIEW public.simulado_disciplinas_visao AS
  SELECT t.nome AS plataforma, t.slug AS plataforma_slug, d.nome AS disciplina, d.classificacao, d.ordem, d.cor,
         d.id, d.tenant_id, d.created_at
    FROM public.simulado_disciplinas d
    JOIN public.simulado_tenants t ON t.id = d.tenant_id
   ORDER BY t.nome, d.ordem NULLS LAST, d.nome;

NOTIFY pgrst, 'reload schema';
