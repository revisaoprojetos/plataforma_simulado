// Remove, EM LOTE, do pasta_estudantes de um banco todos os estudantes que são membros
// de um grupo (ex.: tirar os passaportes de um banco sem travar a UI).
// Uso: node scripts/limpar-grupo-do-banco.mjs <pasta_id> <grupo_id>
import { readFileSync } from 'node:fs'

const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const BANK = process.argv[2]
const GRUPO = process.argv[3]
if (!BANK || !GRUPO) { console.error('uso: node scripts/limpar-grupo-do-banco.mjs <pasta_id> <grupo_id>'); process.exit(1) }

async function countPE() {
  const r = await fetch(`${URL}/rest/v1/simulado_pasta_estudantes?pasta_id=eq.${BANK}&select=estudante_id`, { headers: { ...H, Prefer: 'count=exact', Range: '0-0' } })
  return Number((r.headers.get('content-range') || '*/0').split('/')[1])
}
async function allMembros() {
  const out = []
  for (let f = 0; ; f += 1000) {
    const r = await fetch(`${URL}/rest/v1/simulado_grupo_membros?grupo_id=eq.${GRUPO}&select=estudante_id`, { headers: { ...H, Range: `${f}-${f + 999}` } })
    const rows = await r.json(); out.push(...rows); if (rows.length < 1000) break
  }
  return [...new Set(out.map((m) => m.estudante_id).filter(Boolean))]
}

const antes = await countPE()
const ids = await allMembros()
console.log(`pasta_estudantes ANTES: ${antes} · membros do grupo: ${ids.length}`)

let reqs = 0
for (let i = 0; i < ids.length; i += 120) {
  const chunk = ids.slice(i, i + 120)
  const r = await fetch(`${URL}/rest/v1/simulado_pasta_estudantes?pasta_id=eq.${BANK}&estudante_id=in.(${chunk.join(',')})`, { method: 'DELETE', headers: { ...H, Prefer: 'return=minimal' } })
  if (!r.ok) console.error('  chunk falhou:', r.status, (await r.text()).slice(0, 120))
  reqs++
}
const depois = await countPE()
console.log(`pasta_estudantes DEPOIS: ${depois} · removidos: ${antes - depois} (em ${reqs} requisições)`)
