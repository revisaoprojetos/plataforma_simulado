// Ativa a gamificação de um tenant (simulado_gamificacao_config.ativo = true).
// Cria a linha de config (com defaults do banco) caso ainda não exista.
//
// Uso:
//   node scripts/gamificacao-ativar.mjs <slug-ou-tenantId>
//   node scripts/gamificacao-ativar.mjs --todos          (ativa em TODOS os tenants — cuidado)
//
// Lê credenciais de apps/web/.env.local (SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// Requer a migração 20260812000001 aplicada (tabela de config). 000002/000003 são opcionais
// (rodízio de missões / meta diária ficam em fallback até serem aplicadas).

import { readFileSync } from 'node:fs'

let env = ''
try { env = readFileSync('apps/web/.env.local', 'utf8') } catch {}
const get = (k) => (process.env[k] ?? env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
if (!URL || !KEY) { console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em apps/web/.env.local'); process.exit(1) }

const arg = process.argv[2]
if (!arg) { console.error('Uso: node scripts/gamificacao-ativar.mjs <slug-ou-tenantId> | --todos'); process.exit(1) }
const H = { apikey: KEY, authorization: 'Bearer ' + KEY, 'content-type': 'application/json' }
const rest = (p, opt = {}) => fetch(URL + '/rest/v1/' + p, { headers: H, ...opt })
const json = (r) => r.json()
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s)

async function tenantsAlvo() {
  if (arg === '--todos') return json(await rest('simulado_tenants?select=id,slug,nome'))
  if (isUuid(arg)) return json(await rest(`simulado_tenants?select=id,slug,nome&id=eq.${arg}`))
  return json(await rest(`simulado_tenants?select=id,slug,nome&slug=eq.${encodeURIComponent(arg)}`))
}

async function ativar(t) {
  // Tenta atualizar; se não houver linha, insere (defaults das colunas + fallback do app).
  const upd = await rest(`simulado_gamificacao_config?tenant_id=eq.${t.id}`, { method: 'PATCH', headers: { ...H, prefer: 'return=representation' }, body: JSON.stringify({ ativo: true }) })
  const rows = upd.ok ? await json(upd) : []
  if (Array.isArray(rows) && rows.length) return 'ativado'
  const ins = await rest('simulado_gamificacao_config', { method: 'POST', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify({ tenant_id: t.id, ativo: true }) })
  if (!ins.ok) throw new Error(`insert HTTP ${ins.status}: ${await ins.text()}`)
  return 'criado+ativado'
}

async function main() {
  const tenants = await tenantsAlvo()
  if (!Array.isArray(tenants) || !tenants.length) { console.error(`Nenhum tenant para "${arg}".`); process.exit(1) }
  for (const t of tenants) {
    try { console.log(`✓ ${t.slug ?? t.id} (${t.nome ?? ''}): ${await ativar(t)}`) }
    catch (e) { console.error(`✗ ${t.slug ?? t.id}:`, e.message) }
  }
  console.log('\nPronto. Rode o backfill p/ XP retroativo (opcional):')
  console.log('  node scripts/backfill-gamificacao.mjs <tenantId>')
}

main().catch((e) => { console.error(e); process.exit(1) })
