
-- 1. Renumera ordens existentes para garantir 1..N sem buracos antes do UNIQUE
WITH renum AS (
  SELECT id,
    row_number() OVER (PARTITION BY simulado_id ORDER BY ordem, id) AS nova_ordem
  FROM public.questao_simulado
)
UPDATE public.questao_simulado q
SET ordem = renum.nova_ordem
FROM renum
WHERE q.id = renum.id AND q.ordem <> renum.nova_ordem;

-- 2. Garante unicidade de ordem por simulado
ALTER TABLE public.questao_simulado
  ADD CONSTRAINT questao_simulado_unique_ordem UNIQUE (simulado_id, ordem);

-- 3. Função de diagnóstico (retorna lista de problemas)
CREATE OR REPLACE FUNCTION public.validar_questoes_simulado(_simulado_id uuid)
RETURNS TABLE(problema text, detalhe text)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_total integer;
  v_max_ordem integer;
  v_min_ordem integer;
  v_duplicadas integer;
BEGIN
  SELECT count(*), coalesce(max(ordem),0), coalesce(min(ordem),0)
    INTO v_total, v_max_ordem, v_min_ordem
  FROM public.questao_simulado WHERE simulado_id = _simulado_id;

  IF v_total = 0 THEN
    RETURN QUERY SELECT 'sem_questoes'::text, 'O simulado não tem nenhuma questão vinculada.'::text;
    RETURN;
  END IF;

  IF v_min_ordem <> 1 THEN
    RETURN QUERY SELECT 'ordem_nao_inicia_em_1'::text,
      format('A menor ordem é %s; deveria ser 1.', v_min_ordem);
  END IF;

  IF v_max_ordem <> v_total THEN
    RETURN QUERY SELECT 'lacuna_ou_excesso_na_ordem'::text,
      format('Total de questões = %s; maior ordem = %s. Há lacunas.', v_total, v_max_ordem);
  END IF;

  -- Duplicatas defensivas (deveria ser bloqueado pelo UNIQUE)
  SELECT count(*) INTO v_duplicadas FROM (
    SELECT ordem FROM public.questao_simulado
    WHERE simulado_id = _simulado_id
    GROUP BY ordem HAVING count(*) > 1
  ) x;
  IF v_duplicadas > 0 THEN
    RETURN QUERY SELECT 'ordem_duplicada'::text,
      format('%s ordem(ns) duplicada(s).', v_duplicadas);
  END IF;

  -- Pesos inválidos (defensivo; CHECK já garante > 0)
  IF EXISTS (
    SELECT 1 FROM public.questao_simulado
    WHERE simulado_id = _simulado_id AND (peso IS NULL OR peso <= 0)
  ) THEN
    RETURN QUERY SELECT 'peso_invalido'::text,
      'Há vínculos com peso nulo ou menor que zero.'::text;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.validar_questoes_simulado(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validar_questoes_simulado(uuid) TO authenticated;

-- 4. Trigger que bloqueia a transição para agendado/em_andamento se houver problemas
CREATE OR REPLACE FUNCTION public.bloquear_publicacao_invalida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_problemas text;
BEGIN
  IF NEW.status IN ('agendado','em_andamento')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN

    SELECT string_agg(problema || ': ' || detalhe, ' | ')
      INTO v_problemas
      FROM public.validar_questoes_simulado(NEW.id);

    IF v_problemas IS NOT NULL THEN
      RAISE EXCEPTION 'Não é possível publicar este simulado. Problemas: %', v_problemas
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bloquear_publicacao ON public.simulados;
CREATE TRIGGER trg_bloquear_publicacao
  BEFORE INSERT OR UPDATE OF status ON public.simulados
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_publicacao_invalida();
