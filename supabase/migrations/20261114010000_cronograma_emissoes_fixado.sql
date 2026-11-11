-- Cronograma Revisão (emissões legadas) passa a poder ser o plano FIXADO (foco) do aluno, ao lado do
-- Adaptativo. Só 1 plano fixado por aluno ENTRE os dois tipos: a troca é feita atomicamente pela função
-- cronograma_fixar_plano (um único comando no banco — sem janela "desfixa / fixa").
-- Idempotente. Código tolera a migração pendente (cai no comportamento antigo).

ALTER TABLE public.simulado_cronograma_emissoes
  ADD COLUMN IF NOT EXISTS fixado boolean NOT NULL DEFAULT false;

-- No máximo 1 emissão fixada (não arquivada) por aluno.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_cron_emissao_fixada
  ON public.simulado_cronograma_emissoes (tenant_id, estudante_id)
  WHERE fixado AND NOT arquivada;

-- Fixa um plano (p_tipo = 'adaptativo' | 'revisao') e desfixa os demais dos DOIS tipos, numa transação.
-- Devolve false se o plano não existe / não é do aluno / está arquivado (nada é alterado).
CREATE OR REPLACE FUNCTION public.cronograma_fixar_plano(p_tenant uuid, p_estudante uuid, p_tipo text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  achou boolean;
BEGIN
  IF p_tipo = 'adaptativo' THEN
    SELECT EXISTS (SELECT 1 FROM public.simulado_cronograma_adaptativo_plano
                    WHERE id = p_id AND tenant_id = p_tenant AND estudante_id = p_estudante AND NOT arquivada) INTO achou;
  ELSIF p_tipo = 'revisao' THEN
    SELECT EXISTS (SELECT 1 FROM public.simulado_cronograma_emissoes
                    WHERE id = p_id AND tenant_id = p_tenant AND estudante_id = p_estudante AND NOT arquivada) INTO achou;
  ELSE
    RETURN false;
  END IF;
  IF NOT achou THEN RETURN false; END IF;

  UPDATE public.simulado_cronograma_adaptativo_plano SET fixado = false
   WHERE tenant_id = p_tenant AND estudante_id = p_estudante AND fixado AND NOT (p_tipo = 'adaptativo' AND id = p_id);
  UPDATE public.simulado_cronograma_emissoes SET fixado = false
   WHERE tenant_id = p_tenant AND estudante_id = p_estudante AND fixado AND NOT (p_tipo = 'revisao' AND id = p_id);

  IF p_tipo = 'adaptativo' THEN
    UPDATE public.simulado_cronograma_adaptativo_plano SET fixado = true, atualizado_em = now() WHERE id = p_id;
  ELSE
    UPDATE public.simulado_cronograma_emissoes SET fixado = true, atualizado_em = now() WHERE id = p_id;
  END IF;
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.cronograma_fixar_plano(uuid, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cronograma_fixar_plano(uuid, uuid, text, uuid) TO service_role;
