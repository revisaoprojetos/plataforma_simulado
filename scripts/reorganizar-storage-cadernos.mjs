// Reorganiza os assets externos dos cadernos em SUBPASTAS por simulado, mantendo os buckets atuais:
//   imagens/cadernos/<simulado>/<arquivo>   e   pdfs/materiais/<tenant>/<simulado>/<arquivo>
// COPIA (não move) e mantém os originais; reaponta as URLs no banco (config + capa_url). Backup antes.
// Dry-run por padrão; use --apply para aplicar.
import { readFileSync, writeFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const j = async (p) => (await fetch(`${URL}/rest/v1/${p}`, { headers: H })).json()
const TEN = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const APPLY = process.argv.includes('--apply')

const slug = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'sem-nome'
const parseUrl = (u) => { const m = String(u).match(/\/object\/(?:public|sign)\/([^/]+)\/([^?]+)/); return m ? { bucket: m[1], path: decodeURIComponent(m[2]) } : null }
const pub = (bucket, path) => `${URL}/storage/v1/object/public/${bucket}/${path.split('/').map(encodeURIComponent).join('/')}`
const destDe = (bucket, path, simSlug) => {
  const base = path.split('/').pop()
  if (bucket === 'imagens') return `cadernos/${simSlug}/${base}`
  if (bucket === 'pdfs') return `materiais/${TEN}/${simSlug}/${base}`
  return `${simSlug}/${base}`
}
async function copiar(bucket, sourceKey, destinationKey) {
  const r = await fetch(`${URL}/storage/v1/object/copy`, { method: 'POST', headers: H, body: JSON.stringify({ bucketId: bucket, sourceKey, destinationKey }) })
  if (r.ok) return 'ok'
  const t = await r.text()
  if (/exists|Duplicate|already/i.test(t) || r.status === 409) return 'já existia'
  return `ERRO ${r.status}: ${t.slice(0, 120)}`
}

// caderno → nome do simulado (via regras.caderno_id OU banco.caderno_id)
const sims = await j(`simulado_simulados?deletado=eq.false&tenant_id=eq.${TEN}&select=id,titulo,regras&limit=1000`)
const pastas = await j(`simulado_pastas?tenant_id=eq.${TEN}&select=id,caderno_id&limit=2000`)
const cadDoBanco = new Map(pastas.map((p) => [p.id, p.caderno_id]))
const simDoCaderno = new Map()
for (const s of sims) { const r = s.regras || {}; const cid = r.caderno_id || (r.banco_base_id ? cadDoBanco.get(r.banco_base_id) : null); if (cid && !simDoCaderno.has(cid)) simDoCaderno.set(cid, s.titulo) }

const cads = await j(`simulado_cadernos_designer?tenant_id=eq.${TEN}&select=id,nome,capa_url,config&limit=1000`)
const backup = []
let nCad = 0, nCopias = 0, nSkip = 0
for (const c of cads) {
  const simNome = simDoCaderno.get(c.id)
  if (!simNome) { nSkip++; continue } // caderno sem simulado (lixo de teste) → ignora
  const simSlug = slug(simNome)
  const cfgStr0 = JSON.stringify(c.config ?? {})
  // Coleta URLs de storage (imagens/pdfs deste projeto) do config + capa_url
  const alvos = new Set()
  for (const m of cfgStr0.matchAll(/https?:\/\/[^"'\\ )]+/g)) { const p = parseUrl(m[0]); if (p && ['imagens', 'pdfs'].includes(p.bucket)) alvos.add(m[0]) }
  if (c.capa_url && parseUrl(c.capa_url)) alvos.add(c.capa_url)
  if (!alvos.size) { nSkip++; continue }

  console.log(`\n● "${c.nome}" (${c.id.slice(0, 8)}) → pasta "${simSlug}"  [${alvos.size} arquivo(s)]`)
  const mapa = [] // [oldUrl, newUrl]
  for (const oldUrl of alvos) {
    const pu = parseUrl(oldUrl); if (!pu) continue
    const dest = destDe(pu.bucket, pu.path, simSlug)
    if (dest === pu.path) { console.log(`   = ${pu.bucket}/${pu.path} (já organizado)`); continue }
    const newUrl = pub(pu.bucket, dest)
    let status = 'DRY'
    if (APPLY) { status = await copiar(pu.bucket, pu.path, dest); nCopias++ }
    console.log(`   ${pu.bucket}: ${pu.path.split('/').pop()} → ${dest}  [${status}]`)
    if (!APPLY || status === 'ok' || status === 'já existia') mapa.push([oldUrl, newUrl])
  }
  if (!mapa.length) continue
  // Reaponta config (todas as ocorrências) + capa_url
  let cfgStr = cfgStr0, capa = c.capa_url
  for (const [o, n] of mapa) { cfgStr = cfgStr.split(o).join(n); if (capa) capa = capa.split(o).join(n) }
  backup.push({ id: c.id, capa_url: c.capa_url, config: c.config })
  nCad++
  if (APPLY) {
    const body = JSON.stringify({ config: JSON.parse(cfgStr), capa_url: capa })
    const r = await fetch(`${URL}/rest/v1/simulado_cadernos_designer?id=eq.${c.id}`, { method: 'PATCH', headers: { ...H, prefer: 'return=minimal' }, body })
    console.log(`   ↳ banco reapontado: ${r.status}`)
  }
}

console.log(`\n=== ${APPLY ? 'APLICADO' : 'DRY-RUN'} === cadernos afetados=${nCad} | cópias=${nCopias} | ignorados(sem simulado/sem asset)=${nSkip}`)
if (APPLY) { writeFileSync('scripts/_backup-storage-reorg-cadernos.json', JSON.stringify(backup, null, 2)); console.log('✔ Backup em scripts/_backup-storage-reorg-cadernos.json (config+capa_url anteriores)') }
else console.log('Rode com --apply para copiar e reapontar.')
