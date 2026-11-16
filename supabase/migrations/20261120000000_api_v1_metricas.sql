-- API pública v1: /api/v1/metricas/resumo — agregados do período num único RPC (somente leitura, idempotente).
-- Aplicar manualmente (SQL editor). Só service role (a rota usa createAdminClient).
create or replace function public.api_v1_metricas_resumo(p_tenant uuid, p_desde timestamptz, p_ate timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'alunos_total', (select count(*) from public.simulado_estudantes where tenant_id = p_tenant),
    'alunos_ativos', (select count(distinct estudante_id) from public.simulado_aluno_acessos
                       where tenant_id = p_tenant and iniciado_em >= p_desde and iniciado_em <= p_ate),
    'acessos', (select count(*) from public.simulado_aluno_acessos
                 where tenant_id = p_tenant and iniciado_em >= p_desde and iniciado_em <= p_ate),
    'atividades_total', (select count(*) from public.simulado_aluno_atividades
                          where tenant_id = p_tenant and criado_em >= p_desde and criado_em <= p_ate),
    'atividades_por_tipo', coalesce((
      select jsonb_object_agg(tipo, n) from (
        select tipo, count(*) as n from public.simulado_aluno_atividades
         where tenant_id = p_tenant and criado_em >= p_desde and criado_em <= p_ate
         group by tipo) t), '{}'::jsonb)
  );
$$;

revoke all on function public.api_v1_metricas_resumo(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.api_v1_metricas_resumo(uuid, timestamptz, timestamptz) to service_role;

notify pgrst, 'reload schema';
