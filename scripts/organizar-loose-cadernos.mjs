// Limpa a RAIZ de imagens/cadernos/: (A) migra cadernos ainda na raiz (órfãos sem simulado) para
// uma subpasta do caderno; (B) apaga os arquivos soltos da raiz que NÃO são mais referenciados
// (originais duplicados — as cópias já estão nas subpastas). Backup/manifesto. Dry-run; --apply.
import { readFileSync, writeFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const j = async (p) => (await fetch(`${URL}/rest/v1/${p}`, { headers: H })).json()
const TEN = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const APPLY = process.argv.includes('--apply')
const LIMPAR = process.argv.includes('--limpar') // Fase B (apagar raiz) só com --limpar (destrutivo)
const BKT = 'imagens', RAIZ = 'cadernos'

const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sem-nome'
const parseUrl = (u) => { const m = String(u).match(/\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/); return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null }
const pub = (bucket, path) => `${URL}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
async function copiar(sourceKey, destinationKey) {
  const r = await fetch(`${URL}/storage/v1/object/copy`, { method: 'POST', headers: H, body: JSON.stringify({ bucketId: BKT, sourceKey, destinationKey }) })
  if (r.ok) return 'ok'; const t = await r.text(); if (/exists|Duplicate|already/i.test(t) || r.status === 409) return 'já existia'; return `ERRO ${r.status}: ${t.slice(0, 100)}`
}

// caderno → simulado
const sims = await j(`simulado_simulados?deletado=eq.false&tenant_id=eq.${TEN}&select=id,titulo,regras&limit=1000`)
const pastas = await j(`simulado_pastas?tenant_id=eq.${TEN}&select=id,caderno_id&limit=2000`)
const cadDoBanco = new Map(pastas.map((p) => [p.id, p.caderno_id]))
const simDoCaderno = new Map()
for (const s of sims) { const r = s.regras || {}; const cid = r.caderno_id || (r.banco_base_id ? cadDoBanco.get(r.banco_base_id) : null); if (cid && !simDoCaderno.has(cid)) simDoCaderno.set(cid, s.titulo) }

const cads = await j(`simulado_cadernos_designer?tenant_id=eq.${TEN}&select=id,nome,capa_url,config&limit=1000`)
const imgsDe = (c) => { // paths do bucket imagens referenciados por este caderno (config + capa_url)
  const out = new Set(); const s = JSON.stringify(c.config ?? {})
  for (const m of s.matchAll(/https?:\/\/[^"'\\ )]+/g)) { const p = parseUrl(m[0]); if (p && p.bucket === BKT) out.add(p.path) }
  if (c.capa_url) { const p = parseUrl(c.capa_url); if (p && p.bucket === BKT) out.add(p.path) }
  return out
}

// ---- Fase A: migrar cadernos ainda com imagens na RAIZ (cadernos/<arquivo>) ----
console.log('=== FASE A: migrar cadernos ainda na raiz ===')
const backup = []
let nMig = 0, nCopA = 0
for (const c of cads) {
  const naRaiz = [...imgsDe(c)].filter((p) => /^cadernos\/[^/]+$/.test(p)) // direto na raiz (sem subpasta)
  if (!naRaiz.length) continue
  const folder = slug(simDoCaderno.get(c.id) || c.nome)
  console.log(`\n● "${c.nome}" (${c.id.slice(0, 8)}) → cadernos/${folder}/  [${naRaiz.length}]`)
  const mapa = []
  for (const path of naRaiz) {
    const dest = `${RAIZ}/${folder}/${path.split('/').pop()}`
    let st = 'DRY'; if (APPLY) { st = await copiar(path, dest); nCopA++ }
    console.log(`   ${path.split('/').pop()} → ${dest}  [${st}]`)
    if (!APPLY || st === 'ok' || st === 'já existia') mapa.push([pub(BKT, path), pub(BKT, dest)])
  }
  if (!mapa.length) continue
  let cfgStr = JSON.stringify(c.config ?? {}), capa = c.capa_url
  for (const [o, n] of mapa) { cfgStr = cfgStr.split(o).join(n); if (capa) capa = capa.split(o).join(n) }
  backup.push({ id: c.id, capa_url: c.capa_url, config: c.config }); nMig++
  if (APPLY) { const r = await fetch(`${URL}/rest/v1/simulado_cadernos_designer?id=eq.${c.id}`, { method: 'PATCH', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify({ config: JSON.parse(cfgStr), capa_url: capa }) }); console.log(`   ↳ banco: ${r.status}`) }
}

// ---- Fase B: apagar arquivos soltos na RAIZ que não são mais referenciados ----
console.log('\n=== FASE B: limpar arquivos soltos na raiz (não referenciados) ===')
const cads2 = APPLY ? await j(`simulado_cadernos_designer?tenant_id=eq.${TEN}&select=id,capa_url,config&limit=1000`) : cads
const referenciados = new Set()
for (const c of cads2) for (const p of imgsDe(c)) referenciados.add(p)
const lst = await (await fetch(`${URL}/storage/v1/object/list/${BKT}`, { method: 'POST', headers: H, body: JSON.stringify({ prefix: RAIZ + '/', limit: 1000 }) })).json()
const arquivosRaiz = (Array.isArray(lst) ? lst : []).filter((o) => o.id).map((o) => `${RAIZ}/${o.name}`) // id!=null = arquivo (não pasta)
const apagar = arquivosRaiz.filter((p) => !referenciados.has(p))
console.log(`arquivos soltos na raiz: ${arquivosRaiz.length} | referenciados (manter): ${arquivosRaiz.length - apagar.length} | a apagar: ${apagar.length}`)
for (const p of apagar) console.log(`   apagar: ${p}`)
if (APPLY && !LIMPAR && apagar.length) console.log('   (Fase B ignorada — rode com --limpar para APAGAR os soltos)')
if (APPLY && LIMPAR && apagar.length) {
  const r = await fetch(`${URL}/storage/v1/object/${BKT}`, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: apagar }) })
  console.log(`   DELETE → ${r.status}`)
  writeFileSync('scripts/_manifesto-apagados-cadernos-raiz.json', JSON.stringify({ apagados: apagar, quando: 'ver git' }, null, 2))
}

console.log(`\n=== ${APPLY ? 'APLICADO' : 'DRY-RUN'} === migrados=${nMig} (cópias ${nCopA}) | soltos a apagar=${apagar.length}`)
if (APPLY) { writeFileSync('scripts/_backup-loose-cadernos.json', JSON.stringify(backup, null, 2)); console.log('✔ Backup config em scripts/_backup-loose-cadernos.json') }
else console.log('Rode com --apply para migrar + limpar.')
