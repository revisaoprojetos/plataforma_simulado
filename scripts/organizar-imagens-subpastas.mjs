// Organiza o bucket `imagens`: move de imagens/assets/{hash} para subpastas por TIPO
// (imagens/logos, /banners, /fundos, /cadernos, /bancos, /questoes), conforme onde cada
// imagem é referenciada no banco. Copia -> reescreve URLs -> verifica -> apaga o assets/ antigo.
// REVERSÍVEL: mantém pdfs/assets + backups; grava backup das URLs antes de reescrever.
//   DRY-RUN:  node scripts/organizar-imagens-subpastas.mjs
//   APLICAR:  node scripts/organizar-imagens-subpastas.mjs --aplicar
import { readFileSync, writeFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim().replace(/^"|"$/g, '')
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const APLICAR = process.argv.includes('--aplicar')
const j = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : [] }
console.log(`=== ${APLICAR ? 'APLICANDO' : 'DRY-RUN'} — organizar imagens em subpastas ===`)

// 1) Texto de referência por CATEGORIA (prioridade na ordem abaixo p/ imagem usada em +de 1 lugar)
const cadernos = await j(`simulado_cadernos_designer?select=capa_url,config&limit=10000`)
const tenants = await j(`simulado_tenants?select=tema&limit=200`)
const pastas = await j(`simulado_pastas?select=capa_url,capa_card_url&limit=10000`)
const questoes = await j(`simulado_questoes?select=imagem_url&imagem_url=not.is.null&limit=10000`)
let banners = []
try { banners = await j(`simulado_banners?select=imagem_url&limit=10000`) } catch {}

const temaImgs = (pred) => { let s = ''; const walk = (o, pre = '') => { if (!o || typeof o !== 'object') return; for (const k in o) { const v = o[k]; if (typeof v === 'string' && v.includes('/storage/v1/')) { if (pred(pre + k)) s += ' ' + v } else if (v && typeof v === 'object') walk(v, pre + k + '.') } }; for (const t of tenants) walk(t.tema); return s }
const CATS = [
  { cat: 'logos', texto: temaImgs((k) => /logo/i.test(k)) },
  { cat: 'banners', texto: JSON.stringify(banners) },
  { cat: 'fundos', texto: temaImgs((k) => /fundo|background|banner|capa/i.test(k)) },
  { cat: 'cadernos', texto: JSON.stringify(cadernos) },
  { cat: 'bancos', texto: JSON.stringify(pastas) },
  { cat: 'questoes', texto: JSON.stringify(questoes) },
]
const categoriaDe = (nome) => { for (const c of CATS) if (c.texto.includes(nome)) return c.cat; return 'outras' }

// 2) Imagens atuais em imagens/assets
const listar = async (prefix) => { const out = []; let off = 0; while (true) { const r = await fetch(`${URL}/storage/v1/object/list/imagens`, { method: 'POST', headers: H, body: JSON.stringify({ prefix, limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } }) }); const a = await r.json(); if (!Array.isArray(a) || !a.length) break; out.push(...a); if (a.length < 1000) break; off += 1000 } return out }
const arquivos = (await listar('assets')).filter((f) => f.id && f.metadata).map((f) => f.name)
const plano = arquivos.map((nome) => ({ nome, de: `assets/${nome}`, cat: categoriaDe(nome) }))
const porCat = plano.reduce((m, p) => (m[p.cat] = (m[p.cat] || 0) + 1, m), {})
console.log(`\nimagens em assets/: ${plano.length}`)
console.log('classificação:', JSON.stringify(porCat, null, 0))
for (const p of plano.slice(0, 8)) console.log(`  ${p.nome} -> ${p.cat}/`)
if (plano.some((p) => p.cat === 'outras')) console.log('  (as "outras" não casaram com nenhuma referência — ficarão em imagens/outras/)')

if (!APLICAR) { console.log('\n(DRY-RUN — nada movido.)'); process.exit(0) }

// 3) copiar assets/{nome} -> {cat}/{nome} (download público -> upload)
let copiados = 0, falhas = 0
for (const p of plano) {
  const destino = `${p.cat}/${p.nome}`
  const dl = await fetch(`${URL}/storage/v1/object/public/imagens/${p.de}`)
  if (!dl.ok) { console.log(`  ! download falhou ${p.de}`); p.__skip = true; falhas++; continue }
  const buf = Buffer.from(await dl.arrayBuffer())
  const ct = dl.headers.get('content-type') || 'application/octet-stream'
  const up = await fetch(`${URL}/storage/v1/object/imagens/${destino}`, { method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': ct, 'x-upsert': 'true' }, body: buf })
  if (up.ok) { copiados++; p.para = destino } else { console.log(`  ! upload falhou ${destino}: ${up.status}`); p.__skip = true; falhas++ }
}
console.log(`\ncópia p/ subpastas: ${copiados} ok, ${falhas} falhas`)

// 4) reescrever URLs: /imagens/assets/{nome} -> /imagens/{cat}/{nome}  (só das que copiaram)
const subs = plano.filter((p) => !p.__skip).map((p) => [`imagens/assets/${p.nome}`, `imagens/${p.para}`])
const alvos = [
  { tabela: 'simulado_questoes', cols: ['imagem_url'] },
  { tabela: 'simulado_cadernos_designer', cols: ['capa_url', 'config'] },
  { tabela: 'simulado_tenants', cols: ['tema'] },
  { tabela: 'simulado_pastas', cols: ['capa_url', 'capa_card_url'] },
  { tabela: 'simulado_banners', cols: ['imagem_url'] },
]
const backup = []; let linhas = 0
for (const a of alvos) {
  const rows = await j(`${a.tabela}?select=id,${a.cols.join(',')}&limit=10000`)
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const patch = {}
    for (const c of a.cols) {
      const val = row[c]; if (val == null) continue
      let str = typeof val === 'string' ? val : JSON.stringify(val)
      let mudou = false
      for (const [de, para] of subs) if (str.includes(de)) { str = str.split(de).join(para); mudou = true }
      if (mudou) patch[c] = typeof val === 'string' ? str : JSON.parse(str)
    }
    if (Object.keys(patch).length) {
      linhas++; backup.push({ tabela: a.tabela, id: row.id, antes: Object.fromEntries(a.cols.map((c) => [c, row[c]])) })
      const r = await fetch(`${URL}/rest/v1/${a.tabela}?id=eq.${row.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
      if (!r.ok) console.log(`  ! patch ${a.tabela} ${row.id}: ${r.status}`)
    }
  }
}
writeFileSync('scripts/_backup-urls-subpastas.json', JSON.stringify(backup, null, 2))
console.log(`URLs reescritas: ${linhas} linhas (backup: scripts/_backup-urls-subpastas.json)`)

// 5) atualizar catálogo simulado_arquivos (path assets -> subpasta)
for (const p of plano.filter((x) => !x.__skip)) {
  await fetch(`${URL}/rest/v1/simulado_arquivos?bucket=eq.imagens&path=eq.assets/${p.nome}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ path: p.para }) })
}
console.log('catálogo simulado_arquivos atualizado (paths).')

// 6) verificar que tudo resolve antes de apagar os assets antigos
let quebradas = 0
for (const p of plano.filter((x) => !x.__skip)) { const r = await fetch(`${URL}/storage/v1/object/public/imagens/${p.para}`, { method: 'HEAD' }); if (!r.ok) { quebradas++; console.log(`  X não resolve ${p.para}`) } }
if (quebradas) { console.log(`\n! ${quebradas} não resolveram — NÃO vou apagar o assets/. Revise antes.`); process.exit(1) }

// 7) apagar os assets/ antigos (já copiados e com URLs migradas)
const apagar = plano.filter((x) => !x.__skip).map((p) => p.de)
if (apagar.length) { const r = await fetch(`${URL}/storage/v1/object/imagens`, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: apagar }) }); console.log(`assets/ antigos removidos: ${r.ok ? apagar.length : 'FALHA ' + r.status}`) }
console.log('\n=== ORGANIZAÇÃO EM SUBPASTAS CONCLUÍDA ===')
