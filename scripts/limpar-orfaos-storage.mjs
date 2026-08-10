// Limpa arquivos ÓRFÃOS do bucket pdfs (sem NENHUMA referência viva no banco).
// Recalcula os órfãos na hora (não confia em lista velha), baixa cada um p/ backup local
// e só então deleta do storage. DRY-RUN por padrão.
//   DRY-RUN:  node scripts/limpar-orfaos-storage.mjs
//   APLICAR:  node scripts/limpar-orfaos-storage.mjs --aplicar
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim().replace(/^"|"$/g, '')
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const APLICAR = process.argv.includes('--aplicar')
const BKP = 'scripts/_backup-storage-orfaos'
const j = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : [] }
console.log(`=== ${APLICAR ? 'APLICANDO (backup + delete)' : 'DRY-RUN'} ===`)

// 1) objetos do bucket pdfs
const listar = async (bucket, prefix = '') => { const out = []; let off = 0; while (true) { const r = await fetch(`${URL}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: H, body: JSON.stringify({ prefix, limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } }) }); const a = await r.json(); if (!Array.isArray(a) || !a.length) break; out.push(...a); if (a.length < 1000) break; off += 1000 } return out }
const objetos = []
const bfs = async (bucket) => { const fila = ['']; while (fila.length) { const pre = fila.shift(); for (const it of await listar(bucket, pre)) { if (it.id === null || it.metadata == null) fila.push(pre ? `${pre}/${it.name}` : it.name); else objetos.push({ path: pre ? `${pre}/${it.name}` : it.name, size: Number(it.metadata?.size ?? 0) }) } } }
await bfs('pdfs')

// 2) texto de TODAS as referências vivas
const paginar = async (base) => { let off = 0, all = []; while (true) { const rows = await j(`${base}&limit=1000&offset=${off}`); if (!Array.isArray(rows) || !rows.length) break; all.push(...rows); if (rows.length < 1000) break; off += 1000 } return all }
let ref = ''
ref += JSON.stringify(await paginar(`simulado_questoes?select=imagem_url,enunciado,comentario_professor`))
ref += JSON.stringify(await paginar(`simulado_cadernos_designer?select=*`))
ref += JSON.stringify(await paginar(`simulado_tenants?select=tema`))
ref += JSON.stringify(await paginar(`simulado_pastas?select=capa_url,capa_card_url`))
try { ref += JSON.stringify(await paginar(`simulado_respostas_discursivas?select=arquivos`)) } catch {}
const pj = await j(`simulado_pdf_jobs?select=*&limit=1000`); if (Array.isArray(pj)) ref += JSON.stringify(pj)

// 3) órfãos = basename não aparece em nenhuma referência
const basename = (p) => p.split('/').pop()
const orfaos = objetos.filter((o) => !ref.includes(basename(o.path)))
const totMB = (orfaos.reduce((s, o) => s + o.size, 0) / 1048576).toFixed(1)
console.log(`\nbucket pdfs: ${objetos.length} objetos | ÓRFÃOS: ${orfaos.length} (${totMB} MB)`)
for (const o of orfaos) console.log(`  - ${o.path} (${Math.round(o.size / 1024)}KB)`)

if (!APLICAR) { console.log('\n(DRY-RUN — nada baixado/deletado. Rode com --aplicar.)'); process.exit(0) }

// 4) backup local + manifest
mkdirSync(BKP, { recursive: true })
const manifest = { quando: new Date().toISOString(), bucket: 'pdfs', total: orfaos.length, arquivos: orfaos.map((o) => o.path) }
writeFileSync(`${BKP}/manifest.json`, JSON.stringify(manifest, null, 2))
let baixados = 0
for (const o of orfaos) {
  const r = await fetch(`${URL}/storage/v1/object/pdfs/${o.path}`, { headers: { apikey: KEY, authorization: `Bearer ${KEY}` } })
  if (!r.ok) { console.log(`  ! falha ao baixar ${o.path} (${r.status}) — PULANDO delete deste`); o.__skip = true; continue }
  const buf = Buffer.from(await r.arrayBuffer())
  const dest = `${BKP}/${o.path}`; mkdirSync(dirname(dest), { recursive: true }); writeFileSync(dest, buf); baixados++
}
console.log(`\nbackup: ${baixados}/${orfaos.length} baixados em ${BKP}/`)

// 5) delete só dos que fizeram backup
const paraDeletar = orfaos.filter((o) => !o.__skip).map((o) => o.path)
if (paraDeletar.length) {
  const r = await fetch(`${URL}/storage/v1/object/pdfs`, { method: 'DELETE', headers: H, body: JSON.stringify({ prefixes: paraDeletar }) })
  if (!r.ok) { console.log('ERRO delete:', r.status, (await r.text()).slice(0, 200)); process.exit(1) }
  console.log(`deletados do storage: ${paraDeletar.length} arquivos.`)
}
console.log('\n=== LIMPEZA CONCLUÍDA ===')
