// Restaura os textos originais (antes do patch <u>) a partir de scripts/_backup-sublinhado.json.
// Reverte a conversão **→<u> das questões 5,6,8,9 do PGE/RS. Uso: node scripts/restore-sublinhado.mjs
import { readFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const rest = (p, opt) => fetch(`${URL}/rest/v1/${p}`, { headers: H, ...opt })

const bak = JSON.parse(readFileSync('scripts/_backup-sublinhado.json', 'utf8'))
;(async () => {
  for (const q of bak.questoes) {
    const r = await rest(`simulado_questoes?id=eq.${q.id}`, { method: 'PATCH', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify({ enunciado: q.enunciado }) })
    console.log('restore enun', q.id.slice(0, 8), r.status)
  }
  for (const a of bak.alternativas) {
    const r = await rest(`simulado_alternativas?id=eq.${a.id}`, { method: 'PATCH', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify({ texto: a.texto }) })
    console.log('restore alt ', a.id.slice(0, 8), r.status)
  }
  console.log('\n✔ Restaurado ao estado anterior (negrito **).')
})().catch((e) => { console.error('ERRO:', e.message); process.exit(1) })
