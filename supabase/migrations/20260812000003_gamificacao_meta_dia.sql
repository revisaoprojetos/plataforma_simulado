-- Meta diária: soma o XP do aluno NO DIA (no fuso do tenant). Usado para o bônus de meta
-- diária e para o progresso "X/Y XP hoje" no portal. Tolerante: se ausente, o recurso fica inerte.
CREATE OR REPLACE FUNCTION public.rpc_xp_dia(p_tenant uuid, p_estudante uuid, p_tz text)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(SUM(xp), 0)::bigint
  FROM public.simulado_xp_eventos
  WHERE tenant_id = p_tenant AND estudante_id = p_estudante
    AND (criado_em AT TIME ZONE p_tz)::date = (now() AT TIME ZONE p_tz)::date
$$;
