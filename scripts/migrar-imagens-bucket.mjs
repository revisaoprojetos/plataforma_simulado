// Migra as IMAGENS de pdfs/assets -> imagens/assets e reescreve as URLs no banco.
// Rodar SÓ quando for virar STORAGE_IMAGE_BUCKET=imagens (deploy da branch organizacao-storage).
// REVERSÍVEL: mantém os objetos em pdfs/assets (não deleta) e faz backup das URLs antes de reescrever
// — para reverter, basta restaurar as URLs do backup. Só delete pdfs/assets depois de validar tudo.
//   DRY-RUN:  node scripts/migrar-imagens-bucket.mjs
//   APLICAR:  node scripts/migrar-imagens-bucket.mjs --aplicar
import { readFileSync, writeFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim().replace(/^"|"$/g, '')
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const APLICAR = process.argv.includes('--aplicar')
const DE = 'pdfs', PARA = 'imagens'
const j = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : [] }
console.log(`=== ${APLICAR ? 'APLICANDO' : 'DRY-RUN'} — migrar imagens ${DE}/assets -> ${PARA}/assets ===`)

// 1) objetos em pdfs/assets
const listar = async (prefix) => { const out = []; let off = 0; while (true) { const r = await fetch(`${URL}/storage/v1/object/list/${DE}`, { method: 'POST', headers: H, body: JSON.stringify({ prefix, limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } }) }); const a = await r.json(); if (!Array.isArray(a) || !a.length) break; out.push(...a); if (a.length < 1000) break; off += 1000 } return out }
const assets = (await listar('assets')).filter((f) => f.id && f.metadata).map((f) => `assets/${f.name}`)
console.log(`imagens em ${DE}/assets: ${assets.length}`)

// 2) copiar cada objeto p/ o bucket destino (download público -> upload). Idempotente (upsert).
if (APLICAR) {
  let copiados = 0, jaExistiam = 0, falhas = 0
  for (const path of assets) {
    // pula se já existe no destino
    const chk = await fetch(`${URL}/storage/v1/object/list/${PARA}`, { method: 'POST', headers: H, body: JSON.stringify({ prefix: 'assets', search: path.split('/').pop(), limit: 1 }) })
    const has = (await chk.json())?.some?.((f) => f.name === path.split('/').pop())
    if (has) { jaExistiam++; continue }
    const dl = await fetch(`${URL}/storage/v1/object/public/${DE}/${path}`)
    if (!dl.ok) { falhas++; continue }
    const buf = Buffer.from(await dl.arrayBuffer())
    const ct = dl.headers.get('content-type') || 'application/octet-stream'
    const up = await fetch(`${URL}/storage/v1/object/${PARA}/${path}`, { method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': ct, 'x-upsert': 'true' }, body: buf })
    if (up.ok) copiados++; else falhas++
  }
  console.log(`cópia: ${copiados} novos, ${jaExistiam} já existiam, ${falhas} falhas`)
}

// 3) reescrever URLs no banco: /public/pdfs/assets/ -> /public/imagens/assets/
const DEURL = `/object/public/${DE}/assets/`, PARAURL = `/object/public/${PARA}/assets/`
const alvos = [
  { tabela: 'simulado_questoes', cols: ['imagem_url'] },
  { tabela: 'simulado_cadernos_designer', cols: ['capa_url', 'config'] },
  { tabela: 'simulado_tenants', cols: ['tema'] },
  { tabela: 'simulado_pastas', cols: ['capa_url', 'capa_card_url'] },
]
const backup = []
let totalLinhas = 0
for (const a of alvos) {
  const rows = await j(`${a.tabela}?select=id,${a.cols.join(',')}&limit=10000`)
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const patch = {}
    for (const c of a.cols) {
      const val = row[c]
      if (val == null) continue
      const str = typeof val === 'string' ? val : JSON.stringify(val)
      if (!str.includes(DEURL)) continue
      const novo = str.split(DEURL).join(PARAURL)
      patch[c] = typeof val === 'string' ? novo : JSON.parse(novo)
    }
    if (Object.keys(patch).length) {
      totalLinhas++
      backup.push({ tabela: a.tabela, id: row.id, antes: Object.fromEntries(a.cols.map((c) => [c, row[c]])) })
      if (APLICAR) {
        const r = await fetch(`${URL}/rest/v1/${a.tabela}?id=eq.${row.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
        if (!r.ok) console.log(`  ! patch ${a.tabela} ${row.id}: ${r.status}`)
      } else {
        console.log(`  [dry] ${a.tabela} ${String(row.id).slice(0, 8)} -> reescreveria ${Object.keys(patch).join(',')}`)
      }
    }
  }
}
console.log(`\nlinhas com URL reescrita: ${totalLinhas}`)
if (APLICAR) { writeFileSync('scripts/_backup-urls-imagens.json', JSON.stringify(backup, null, 2)); console.log('backup das URLs anteriores: scripts/_backup-urls-imagens.json') }
else console.log('(DRY-RUN — nada copiado/reescrito.)')
