// Backfill de gamificação — concede XP retroativo dos simulados já finalizados de UM tenant.
// Idempotente (refId=sessao_id, compartilha a chave dos awards ao vivo → re-executável sem duplicar).
// NÃO backfilla streak/missões (começam do zero).
//
// Uso: WEB_INTERNAL_URL=https://<host> CRON_SECRET=<segredo> node scripts/backfill-gamificacao.mjs <tenantId>
//   (ou defina WEB_INTERNAL_URL/CRON_SECRET em apps/web/.env.local)
import { readFileSync } from 'node:fs'

let env = ''
try { env = readFileSync('apps/web/.env.local', 'utf8') } catch {}
const get = (k) => (process.env[k] ?? env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()

const URL = get('WEB_INTERNAL_URL')
const SECRET = get('CRON_SECRET')
const tenant = process.argv[2]

if (!URL || !SECRET) { console.error('Faltam WEB_INTERNAL_URL / CRON_SECRET (env ou apps/web/.env.local).'); process.exit(1) }
if (!tenant) { console.error('Uso: node scripts/backfill-gamificacao.mjs <tenantId>'); process.exit(1) }

console.log(`Backfill de gamificação p/ tenant ${tenant} …`)
const r = await fetch(`${URL}/api/cron/gamificacao-backfill`, {
  method: 'POST',
  headers: { 'x-cron-secret': SECRET, 'content-type': 'application/json' },
  body: JSON.stringify({ tenant }),
})
const j = await r.json().catch(() => null)
if (!r.ok) { console.error(`Falhou (HTTP ${r.status}):`, j); process.exit(1) }
console.log('OK:', j)
