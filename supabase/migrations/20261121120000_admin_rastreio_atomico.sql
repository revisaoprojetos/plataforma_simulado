-- Rastreio admin: tempo ativo ATÔMICO, criação de sessão sem duplicar em lotes concorrentes e revogação das sessões
-- do Supabase Auth ao "encerrar sessão da equipe". Idempotente; só service role.

-- Soma atômica de tempo + heartbeat (só em sessão aberta do próprio user/tenant). Retorna true se atualizou.
create or replace function public.simulado_admin_sessao_somar(p_sid uuid, p_tenant uuid, p_user uuid, p_seg int, p_rota text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.simulado_admin_sessoes
     set ultimo_visto_em = now(),
         rota_atual = coalesce(p_rota, rota_atual),
         tempo_ativo_seg = tempo_ativo_seg + greatest(0, least(coalesce(p_seg, 0), 28800))
   where id = p_sid and tenant_id = p_tenant and user_id = p_user and encerrado_em is null;
  get diagnostics n = row_count;
  return n > 0;
end $$;

-- Obtém sessão aberta recente (mesmo IP+UA, visto < 30 min) ou cria — serializado por usuário (sem duplicar).
create or replace function public.simulado_admin_sessao_obter(
  p_tenant uuid, p_user uuid, p_ip text, p_ua text, p_navegador text, p_so text, p_dispositivo text
) returns table (id uuid, nova boolean) language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_tenant::text || p_user::text, 0));
  select s.id into v from public.simulado_admin_sessoes s
   where s.tenant_id = p_tenant and s.user_id = p_user and s.encerrado_em is null
     and s.ultimo_visto_em > now() - interval '30 minutes'
     and s.ip is not distinct from p_ip and s.user_agent is not distinct from p_ua
   order by s.ultimo_visto_em desc limit 1;
  if v is not null then return query select v, false; return; end if;
  insert into public.simulado_admin_sessoes (tenant_id, user_id, ip, user_agent, navegador, so, dispositivo)
  values (p_tenant, p_user, p_ip, p_ua, p_navegador, p_so, p_dispositivo) returning simulado_admin_sessoes.id into v;
  return query select v, true;
end $$;

-- Revoga as sessões/refresh tokens do Supabase Auth do usuário (o access token atual expira em até 1h).
create or replace function public.simulado_admin_revogar_auth(p_user uuid)
returns bigint language plpgsql security definer set search_path = public, auth as $$
declare n bigint;
begin
  delete from auth.sessions where user_id = p_user;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.simulado_admin_sessao_somar(uuid, uuid, uuid, int, text) from public, anon, authenticated;
revoke all on function public.simulado_admin_sessao_obter(uuid, uuid, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.simulado_admin_revogar_auth(uuid) from public, anon, authenticated;
notify pgrst, 'reload schema';
