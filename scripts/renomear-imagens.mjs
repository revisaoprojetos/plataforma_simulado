// Renomeia as imagens do bucket `imagens` de {hash}.ext para nomes REFERENTES ao que elas são
// (nome do caderno/banco/banner + papel). Preview por padrão; --aplicar executa (copia novo nome ->
// reescreve URLs -> catálogo -> verifica -> apaga o antigo). REVERSÍVEL: mantém pdfs/assets + backup.
//   PREVIEW:  node scripts/renomear-imagens.mjs
//   APLICAR:  node scripts/renomear-imagens.mjs --aplicar
import { readFileSync, writeFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim().replace(/^"|"$/g, '')
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const APLICAR = process.argv.includes('--aplicar')
const j = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : [] }
const base = (u) => String(u || '').split('/').pop()
const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'sem-nome'
const ext = (nome) => nome.split('.').pop()
console.log(`=== ${APLICAR ? 'APLICANDO' : 'PREVIEW'} — renomear imagens ===`)

// ---- Mapas de referência (basename -> nome desejado) ----
const cadernos = await j(`simulado_cadernos_designer?select=id,nome,capa_url,config&limit=10000`)
const tenants = await j(`simulado_tenants?select=id,slug,tema&limit=200`)
const pastas = await j(`simulado_pastas?select=id,nome,capa_url,capa_card_url&limit=10000`)
const questoes = await j(`simulado_questoes?select=id,imagem_url&imagem_url=not.is.null&limit=10000`)
let banners = []; try { banners = await j(`simulado_banners?select=id,titulo,imagem_url&limit=10000`) } catch {}
const multiTenant = tenants.length > 1

const nomeCaderno = {}, nomeLogo = {}, nomeBanner = {}, nomeBanco = {}, nomeQuestao = {}, nomeFundo = {}
for (const c of cadernos) {
  if (c.capa_url && /imagens\//.test(c.capa_url)) nomeCaderno[base(c.capa_url)] = `${slug(c.nome)}-capa`
  const urls = [...new Set((JSON.stringify(c.config || '').match(/imagens\/[a-z]+\/[A-Za-z0-9._-]+/g) || []))]
  let i = 0
  for (const u of urls) { const b = base(u); if (!nomeCaderno[b]) nomeCaderno[b] = `${slug(c.nome)}-fundo${urls.length > 1 ? '-' + (++i) : ''}` }
}
for (const t of tenants) {
  const suf = multiTenant ? `-${slug(t.slug || t.id.slice(0, 6))}` : ''
  const walk = (o) => { if (!o || typeof o !== 'object') return; for (const k in o) { const v = o[k]; if (typeof v === 'string' && /imagens\//.test(v)) { const b = base(v); if (/logo_grande/i.test(k)) nomeLogo[b] = `logo-grande${suf}`; else if (/logo_selec/i.test(k)) nomeLogo[b] = `logo-selecao${suf}`; else if (/logo/i.test(k)) nomeLogo[b] = `logo${suf}`; else if (/fundo|background/i.test(k)) nomeFundo[b] = `login-fundo${suf}` } else if (v && typeof v === 'object') walk(v) } }
  walk(t.tema)
}
for (const b of banners) if (b.imagem_url && /imagens\//.test(b.imagem_url)) nomeBanner[base(b.imagem_url)] = slug(b.titulo || 'banner')
for (const p of pastas) { if (p.capa_url && /imagens\//.test(p.capa_url)) nomeBanco[base(p.capa_url)] = `${slug(p.nome)}-capa`; if (p.capa_card_url && /imagens\//.test(p.capa_card_url)) nomeBanco[base(p.capa_card_url)] = `${slug(p.nome)}-card` }
for (const q of questoes) if (q.imagem_url && /imagens\//.test(q.imagem_url)) nomeQuestao[base(q.imagem_url)] = `questao-${q.id.slice(0, 8)}`

// ---- Objetos atuais no bucket imagens (por subpasta) ----
const listar = async (pre) => { const r = await fetch(`${URL}/storage/v1/object/list/imagens`, { method: 'POST', headers: H, body: JSON.stringify({ prefix: pre, limit: 1000 }) }); return await r.json() }
const cats = (await listar('')).filter((x) => x.id === null).map((x) => x.name)
const usados = {} // cat -> Set(newbase) p/ unicidade
const plano = []
for (const cat of cats) {
  usados[cat] = new Set()
  for (const f of (await listar(cat)).filter((x) => x.id && x.name !== '.emptyFolderPlaceholder')) {
    const b = f.name, e = ext(b)
    let nome = ({ cadernos: nomeCaderno, logos: nomeLogo, banners: nomeBanner, bancos: nomeBanco, questoes: nomeQuestao, fundos: nomeFundo })[cat]?.[b]
    if (!nome) nome = `${cat.replace(/s$/, '')}-${b.slice(0, 8)}` // fallback
    let novo = `${nome}.${e}`, n = 1
    while (usados[cat].has(novo)) novo = `${nome}-${++n}.${e}`
    usados[cat].add(novo)
    if (novo !== b) plano.push({ cat, de: `${cat}/${b}`, para: `${cat}/${novo}`, deBase: b, paraBase: novo })
  }
}
console.log(`\nrenomeações: ${plano.length}`)
for (const p of plano) console.log(`  ${p.de.padEnd(45)} -> ${p.para}`)

if (!APLICAR) { console.log('\n(PREVIEW — nada alterado. Rode com --aplicar após aprovar os nomes.)'); process.exit(0) }

// ---- APLICAR ----
let copiados = 0
for (const p of plano) {
  const dl = await fetch(`${URL}/storage/v1/object/public/imagens/${p.de}`)
  if (!dl.ok) { console.log(`  ! download ${p.de} ${dl.status}`); p.__skip = true; continue }
  const buf = Buffer.from(await dl.arrayBuffer())
  const up = await fetch(`${URL}/storage/v1/object/imagens/${p.para}`, { method: 'POST', headers: { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': dl.headers.get('content-type') || 'image/png', 'x-upsert': 'true' }, body: buf })
  let key = null; try { key = (await up.json())?.Key } catch {}
  if (up.ok && key) { copiados++ } else { console.log(`  ! upload ${p.para} ${up.status} (sem Key — não persistiu)`); p.__skip = true }
}
console.log(`copiados c/ novo nome: ${copiados}`)

const subs = plano.filter((p) => !p.__skip).map((p) => [`imagens/${p.de}`, `imagens/${p.para}`])
const alvos = [{ t: 'simulado_questoes', c: ['imagem_url'] }, { t: 'simulado_cadernos_designer', c: ['capa_url', 'config'] }, { t: 'simulado_tenants', c: ['tema'] }, { t: 'simulado_pastas', c: ['capa_url', 'capa_card_url'] }, { t: 'simulado_banners', c: ['imagem_url'] }]
const backup = []; let linhas = 0
for (const a of alvos) {
  const rows = await j(`${a.t}?select=id,${a.c.join(',')}&limit=10000`)
  for (const row of (Array.isArray(rows) ? rows : [])) {
    const patch = {}
    for (const col of a.c) { const v = row[col]; if (v == null) continue; let str = typeof v === 'string' ? v : JSON.stringify(v); let mud = false; for (const [de, para] of subs) if (str.includes(de)) { str = str.split(de).join(para); mud = true } if (mud) patch[col] = typeof v === 'string' ? str : JSON.parse(str) }
    if (Object.keys(patch).length) { linhas++; backup.push({ tabela: a.t, id: row.id, antes: Object.fromEntries(a.c.map((c) => [c, row[c]])) }); const r = await fetch(`${URL}/rest/v1/${a.t}?id=eq.${row.id}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(patch) }); if (!r.ok) console.log(`  ! patch ${a.t} ${row.id} ${r.status}`) }
  }
}
writeFileSync('scripts/_backup-urls-rename.json', JSON.stringify(backup, null, 2))
console.log(`URLs reescritas: ${linhas} (backup scripts/_backup-urls-rename.json)`)
for (const p of plano.filter((x) => !x.__skip)) await fetch(`${URL}/rest/v1/simulado_arquivos?bucket=eq.imagens&path=eq.${encodeURIComponent(p.de)}`, { method: 'PATCH', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify({ path: p.para, nome: p.paraBase }) })
// verificar (autoritativo via list, NÃO o HEAD do CDN que pode dar 200 cacheado) antes de apagar
let quebr = 0
for (const p of plano.filter((x) => !x.__skip)) {
  const l = await fetch(`${URL}/storage/v1/object/list/imagens`, { method: 'POST', headers: H, body: JSON.stringify({ prefix: p.cat, search: p.paraBase, limit: 1 }) })
  const found = (await l.json())?.some?.((f) => f.name === p.paraBase)
  if (!found) { quebr++; console.log(`  X não persistiu ${p.para}`) }
}
if (quebr) { console.log(`\n! ${quebr} não persistiram — NÃO apago os antigos.`); process.exit(1) }
const apagar = plano.filter((x) => !x.__skip).map((p) => p.de)
if (apagar.length) { const r = await fetch(`${URL}/storage/v1/object/imagens`, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: apagar }) }); console.log(`antigos removidos: ${r.ok ? apagar.length : 'FALHA ' + r.status}`) }
console.log('\n=== RENOMEAÇÃO CONCLUÍDA ===')
