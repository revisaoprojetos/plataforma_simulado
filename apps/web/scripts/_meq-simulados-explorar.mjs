import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '') }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// 1) Acha o tenant MEQ
const { data: tenants } = await sb.from('simulado_tenants').select('id, nome, dominio').or('nome.ilike.%meq%,dominio.ilike.%meq%')
console.log('Tenants MEQ:', JSON.stringify(tenants, null, 1))
const meq = (tenants || [])[0]
if (!meq) { console.log('MEQ não encontrado — listando todos os tenants:'); const { data: all } = await sb.from('simulado_tenants').select('id, nome, dominio'); console.log(JSON.stringify(all, null, 1)); process.exit(0) }

// 2) Simulados do MEQ + nº de questões + nº de sessões finalizadas (não teste)
const { data: sims } = await sb.from('simulados').select('id, titulo, status, modo_aplicacao, data_inicio, criado_em').eq('tenant_id', meq.id).order('criado_em', { ascending: true })
console.log(`\nSimulados do MEQ (${(sims || []).length}):`)
for (const s of (sims || [])) {
  const { count: nq } = await sb.from('simulado_prova_questoes').select('*', { count: 'exact', head: true }).eq('simulado_id', s.id)
  const { count: ns } = await sb.from('simulado_sessoes_prova').select('*', { count: 'exact', head: true }).eq('simulado_id', s.id).eq('is_teste', false).eq('status', 'finalizada').eq('deletado', false)
  console.log(`  [${s.id}] "${s.titulo}"  status=${s.status}  questões=${nq}  sessões_finalizadas=${ns}  criado=${s.criado_em?.slice(0,10)}`)
}
process.exit(0)
