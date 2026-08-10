// Migra capas de caderno que estão em base64 inline (simulado_cadernos_designer.capa_url)
// para o storage (pdfs/assets/{sha1}.{ext}), replicando EXATAMENTE lib/storage/hospedar-base64.ts
// (mesmo hash => dedup com imagens já existentes). Backup do base64 original antes de trocar.
//   DRY-RUN:  node scripts/migrar-capas-base64.mjs
//   APLICAR:  node scripts/migrar-capas-base64.mjs --aplicar
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim().replace(/^"|"$/g, '')
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const APLICAR = process.argv.includes('--aplicar')
const j = async (p, opt) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H, ...opt }); return r.ok ? r.json() : { __e: r.status, __t: (await r.text()).slice(0, 120) } }
console.log(`=== ${APLICAR ? 'APLICANDO' : 'DRY-RUN'} — migrar capas base64 ===`)

const todas = await j(`simulado_cadernos_designer?select=id,capa_url&limit=1000`)
const alvo = (Array.isArray(todas) ? todas : []).filter((c) => (c.capa_url || '').startsWith('data:image'))
console.log(`cadernos com capa base64: ${alvo.length}`)
if (!alvo.length) process.exit(0)

if (APLICAR) { mkdirSync('scripts', { recursive: true }); writeFileSync('scripts/_backup-capas-base64.json', JSON.stringify(alvo, null, 2)); console.log('backup do base64 original: scripts/_backup-capas-base64.json') }

let ok = 0, falhas = 0
for (const c of alvo) {
  const m = /^data:image\/([a-z0-9.+-]+);base64,(.+)$/i.exec(c.capa_url)
  if (!m) { console.log(`  ! ${c.id.slice(0, 8)}: formato base64 inesperado — pulando`); falhas++; continue }
  const tipo = m[1].toLowerCase(); const ext = tipo === 'jpeg' ? 'jpg' : tipo
  const buf = Buffer.from(m[2], 'base64')
  const nome = `${createHash('sha1').update(buf).digest('hex').slice(0, 24)}.${ext}`
  const path = `assets/${nome}`
  const publicUrl = `${URL}/storage/v1/object/public/pdfs/${path}`
  console.log(`  ${c.id.slice(0, 8)}: ${Math.round(buf.length / 1024)}KB ${tipo} -> ${path}`)
  if (!APLICAR) continue
  // upload (upsert) — se já existir pelo mesmo hash, apenas reafirma
  const up = await fetch(`${URL}/storage/v1/object/pdfs/${path}`, { method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': `image/${tipo}`, 'x-upsert': 'true' }, body: buf })
  if (!up.ok && up.status !== 409) { console.log(`    ! upload falhou ${up.status}: ${(await up.text()).slice(0, 120)} — mantém base64`); falhas++; continue }
  // troca capa_url pela URL pública
  const patch = await fetch(`${URL}/rest/v1/simulado_cadernos_designer?id=eq.${c.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ capa_url: publicUrl }) })
  if (!patch.ok) { console.log(`    ! patch falhou ${patch.status}: ${(await patch.text()).slice(0, 120)}`); falhas++; continue }
  ok++
}
console.log(`\n${APLICAR ? `migradas: ${ok} | falhas: ${falhas}` : '(DRY-RUN — nada gravado)'}`)
