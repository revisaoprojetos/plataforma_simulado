// Organiza + renomeia os PDFs de MATERIAL no bucket `pdfs`:
//   materiais/{tenant}/{uuid}-{hash}.pdf  ->  materiais/{tenant}/{gabarito|enunciado}/{nome-original}.pdf
// Usa config.material.pdfNome (nome de upload) para o nome. Copia -> reescreve config.pdfUrl ->
// catálogo -> verifica (Key/list, não HEAD do CDN) -> apaga o antigo. Backup das URLs antes.
//   DRY-RUN:  node scripts/organizar-renomear-pdfs.mjs
//   APLICAR:  node scripts/organizar-renomear-pdfs.mjs --aplicar
import { readFileSync, writeFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim().replace(/^"|"$/g, '')
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const APLICAR = process.argv.includes('--aplicar')
const j = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : [] }
const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.(docx?|pdf|txt)$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
console.log(`=== ${APLICAR ? 'APLICANDO' : 'DRY-RUN'} — organizar/renomear PDFs de material ===`)

// mapa basename -> {caderno, tipo, pdfNome}
const cad = await j('simulado_cadernos_designer?select=id,nome,config&limit=10000')
const info = {}
for (const c of cad) { const cfg = c.config || {}; for (const [chave, tipo] of [['material', 'gabarito'], ['material_enunciado', 'enunciado']]) { const m = cfg[chave]; if (m?.pdfUrl) info[m.pdfUrl.split('/').pop()] = { caderno: c.nome, tipo, pdfNome: m.pdfNome || null, chave } } }

const listar = async (pre) => { const o = []; let f = 0; while (true) { const r = await fetch(`${URL}/storage/v1/object/list/pdfs`, { method: 'POST', headers: H, body: JSON.stringify({ prefix: pre, limit: 1000, offset: f, sortBy: { column: 'name', order: 'asc' } }) }); const a = await r.json(); if (!Array.isArray(a) || !a.length) break; o.push(...a); if (a.length < 1000) break; f += 1000 } return o }
const bfs = async (pre) => { const objs = []; const fila = [pre]; while (fila.length) { const p = fila.shift(); for (const it of await listar(p)) { const full = p ? `${p}/${it.name}` : it.name; if (it.id === null) fila.push(full); else if (it.name !== '.emptyFolderPlaceholder') objs.push(full) } } return objs }
const materiais = (await bfs('materiais')).filter((p) => p.endsWith('.pdf'))

const usados = {}, plano = []
for (const path of materiais) {
  const b = path.split('/').pop(), tenant = path.split('/')[1]
  const i = info[b]
  if (!i) { console.log(`  (sem referência, pulado): ${path}`); continue }
  const nomeBase = slug(i.pdfNome) || `${slug(i.caderno)}-${i.tipo}` || `${i.tipo}-sem-nome`
  const dir = `materiais/${tenant}/${i.tipo}`
  let novo = `${nomeBase}.pdf`, n = 1; usados[dir] = usados[dir] || new Set()
  while (usados[dir].has(novo)) novo = `${nomeBase}-${++n}.pdf`
  usados[dir].add(novo)
  plano.push({ de: path, para: `${dir}/${novo}`, deBase: b, paraBase: novo, tipo: i.tipo, caderno: i.caderno })
}
console.log(`\nPDFs a organizar/renomear: ${plano.length}`)
for (const p of plano) console.log(`  [${p.tipo}] ${p.caderno.slice(0, 34).padEnd(34)} -> ${p.para.replace(/^materiais\/[^/]+\//, '')}`)

if (!APLICAR) { console.log('\n(DRY-RUN — nada alterado.)'); process.exit(0) }

// copiar
let ok = 0
for (const p of plano) {
  const dl = await fetch(`${URL}/storage/v1/object/public/pdfs/${encodeURI(p.de)}`)
  if (!dl.ok) { console.log(`  ! download ${p.de} ${dl.status}`); p.__skip = true; continue }
  const buf = Buffer.from(await dl.arrayBuffer())
  const up = await fetch(`${URL}/storage/v1/object/pdfs/${encodeURI(p.para)}`, { method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/pdf', 'x-upsert': 'true' }, body: buf })
  let key = null; try { key = (await up.json())?.Key } catch {}
  if (up.ok && key) ok++; else { console.log(`  ! upload ${p.para} ${up.status} (sem Key)`); p.__skip = true }
}
console.log(`copiados: ${ok}`)

// reescrever config.pdfUrl (só cadernos) + catálogo
const subs = plano.filter((p) => !p.__skip).map((p) => [`pdfs/${p.de}`, `pdfs/${p.para}`])
const backup = []; let linhas = 0
const rows = await j('simulado_cadernos_designer?select=id,config&limit=10000')
for (const row of rows) { let str = JSON.stringify(row.config || null); let mud = false; for (const [de, para] of subs) if (str.includes(de)) { str = str.split(de).join(para); mud = true } if (mud) { linhas++; backup.push({ id: row.id, antes: row.config }); const r = await fetch(`${URL}/rest/v1/simulado_cadernos_designer?id=eq.${row.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ config: JSON.parse(str) }) }); if (!r.ok) console.log(`  ! patch caderno ${row.id} ${r.status}`) } }
writeFileSync('scripts/_backup-config-pdfs.json', JSON.stringify(backup, null, 2))
console.log(`configs reescritos: ${linhas} (backup scripts/_backup-config-pdfs.json)`)
for (const p of plano.filter((x) => !x.__skip)) await fetch(`${URL}/rest/v1/simulado_arquivos?bucket=eq.pdfs&path=eq.${encodeURIComponent(p.de)}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ path: p.para, nome: p.paraBase }) })

// verificar (autoritativo) antes de apagar
let quebr = 0
for (const p of plano.filter((x) => !x.__skip)) { const dir = p.para.split('/').slice(0, -1).join('/'); const l = await fetch(`${URL}/storage/v1/object/list/pdfs`, { method: 'POST', headers: H, body: JSON.stringify({ prefix: dir, search: p.paraBase, limit: 1 }) }); if (!(await l.json())?.some?.((f) => f.name === p.paraBase)) { quebr++; console.log(`  X não persistiu ${p.para}`) } }
if (quebr) { console.log(`\n! ${quebr} não persistiram — NÃO apago os antigos.`); process.exit(1) }
const apagar = plano.filter((x) => !x.__skip).map((p) => p.de)
if (apagar.length) { const r = await fetch(`${URL}/storage/v1/object/pdfs`, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: apagar }) }); console.log(`antigos removidos: ${r.ok ? apagar.length : 'FALHA ' + r.status}`) }
console.log('\n=== PDFs ORGANIZADOS/RENOMEADOS ===')
