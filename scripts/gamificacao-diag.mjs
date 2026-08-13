// Diagnóstico da gamificação: verifica migração/config/ativo por tenant. Somente leitura.
import { readFileSync } from 'node:fs'
let env = ''
try { env = readFileSync('apps/web/.env.local', 'utf8') } catch {}
const get = (k) => (process.env[k] ?? env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: 'Bearer ' + KEY, 'content-type': 'application/json' }
const rest = (p, opt = {}) => fetch(URL + '/rest/v1/' + p, { headers: H, ...opt })

async function main() {
  console.log('Base:', URL)
  // Tabela de config existe? (migração 20260812000001)
  const cfgResp = await rest('simulado_gamificacao_config?select=tenant_id,ativo,timezone')
  if (!cfgResp.ok) { console.log('❌ simulado_gamificacao_config:', cfgResp.status, await cfgResp.text(), '\n→ Migração 20260812000001 NÃO aplicada nessa base.'); return }
  const cfgs = await cfgResp.json()
  const byT = new Map(cfgs.map((c) => [c.tenant_id, c]))
  console.log(`✓ Tabela de config existe (${cfgs.length} linha(s)).`)

  const tenants = await (await rest('simulado_tenants?select=id,slug,nome')).json()
  console.log('\nTenants:')
  for (const t of tenants) {
    const c = byT.get(t.id)
    console.log(`  ${c ? (c.ativo ? '🟢 ATIVO' : '⚪ inativo') : '— sem config'}  slug=${t.slug}  ${t.nome ?? ''}  (${t.id})`)
  }

  // Colunas/RPC opcionais
  const col2 = await rest('simulado_gamificacao_config?select=missoes_config&limit=1')
  console.log('\nmissoes_config (mig 000002):', col2.ok ? 'ok' : `ausente (${col2.status})`)
  const rpc = await rest('rpc/rpc_xp_dia', { method: 'POST', body: JSON.stringify({ p_tenant: '00000000-0000-0000-0000-000000000000', p_estudante: '00000000-0000-0000-0000-000000000000', p_tz: 'America/Sao_Paulo' }) })
  console.log('rpc_xp_dia (mig 000003):', rpc.ok ? 'ok' : `ausente (${rpc.status})`)
}
main().catch((e) => { console.error(e); process.exit(1) })
