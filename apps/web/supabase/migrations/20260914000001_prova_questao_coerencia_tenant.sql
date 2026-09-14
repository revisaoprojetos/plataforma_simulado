-- Coerência de tenant em simulado_prova_questoes (o "M5" do CLAUDE.md, que não existia no schema).
--
-- Contexto: as server actions de conteúdo usam createAdminClient (service role, que BYPASSA o RLS) e
-- escrevem em simulado_prova_questoes. A reavaliação da consolidação Banco→Aplicação achou que o
-- guard de app (assertSimuladoDoTenant) era a ÚNICA barreira anti cross-tenant, e o runner do aluno
-- (api/sessoes/current) carrega a prova só por simulado_id. Esta trigger fecha a RAIZ no banco:
-- garante que o simulado e a questão da linha são do MESMO tenant gravado nela — em qualquer caminho,
-- inclusive service role. O guard de app continua como 2ª barreira (defesa em profundidade).
--
-- Perf: dispara só quando tenant_id/simulado_id/questao_id mudam (não em reordenar, que só toca `ordem`);
-- faz 2 lookups por-PK (indexados). Custo desprezível para operações de admin.

CREATE OR REPLACE FUNCTION public.simulado_prova_questao_coerencia_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_sim_tenant uuid;
  v_q_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_sim_tenant FROM public.simulado_simulados WHERE id = NEW.simulado_id;
  IF v_sim_tenant IS NULL OR v_sim_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'simulado_prova_questoes: simulado % nao pertence ao tenant % (coerencia de tenant)', NEW.simulado_id, NEW.tenant_id
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT tenant_id INTO v_q_tenant FROM public.simulado_questoes WHERE id = NEW.questao_id;
  IF v_q_tenant IS NULL OR v_q_tenant IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'simulado_prova_questoes: questao % nao pertence ao tenant % (coerencia de tenant)', NEW.questao_id, NEW.tenant_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_simulado_prova_questao_coerencia ON public.simulado_prova_questoes;
CREATE TRIGGER trg_simulado_prova_questao_coerencia
  BEFORE INSERT OR UPDATE OF tenant_id, simulado_id, questao_id ON public.simulado_prova_questoes
  FOR EACH ROW EXECUTE FUNCTION public.simulado_prova_questao_coerencia_tenant();

NOTIFY pgrst, 'reload schema';
