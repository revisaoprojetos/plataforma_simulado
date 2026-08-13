// Define a CAPA de um banco de simulado (pasta) a partir de um arquivo de imagem local.
// A capa LARGA (capa_url) é herdada por TODOS os simulados do banco nos cards da trilha.
//
// Uso:
//   node scripts/set-capa-banco.mjs "<banco: id ou parte do nome>" <caminho-da-imagem> [--card] [--tenant=<uuid>]
// Ex.:
//   node scripts/set-capa-banco.mjs "Semana de Atualização" ./banner-7dias.png
//   node scripts/set-capa-banco.mjs 2b1c3883-... ./capa.webp --card
//
// --card  → grava em capa_card_url (pôster 4:5) em vez de capa_url (banner largo).
// Lê credenciais de apps/web/.env.local (ou do ambiente): SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, STORAGE_IMAGE_BUCKET (default 'imagens').

import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { extname } from 'node:path'

let env = ''
try { env = readFileSync('apps/web/.env.local', 'utf8') } catch {}
const get = (k) => (process.env[k] ?? env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()

const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const BUCKET = get('STORAGE_IMAGE_BUCKET') || 'imagens'
if (!URL || !KEY) { console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em apps/web/.env.local'); process.exit(1) }

const argv = process.argv.slice(2)
const flags = argv.filter((a) => a.startsWith('--'))
const pos = argv.filter((a) => !a.startsWith('--'))
const [bancoArg, imgPath] = pos
const coluna = flags.includes('--card') ? 'capa_card_url' : 'capa_url'
const tenant = (flags.find((f) => f.startsWith('--tenant=')) || '').split('=')[1] || null
if (!bancoArg || !imgPath) { console.error('Uso: node scripts/set-capa-banco.mjs "<banco id/nome>" <imagem> [--card] [--tenant=<uuid>]'); process.exit(1) }

const H = { apikey: KEY, authorization: 'Bearer ' + KEY }
const rest = (p, opt = {}) => fetch(URL + '/rest/v1/' + p, { headers: { ...H, ...(opt.headers || {}) }, ...opt })
const json = (r) => r.json()
const isUuid = (s) => /^[0-9a-f-]{36}$/i.test(s)
const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml' }

async function main() {
  // 1) Localiza o(s) banco(s) (pasta).
  let filtro = isUuid(bancoArg) ? `id=eq.${bancoArg}` : `nome=ilike.*${encodeURIComponent(bancoArg)}*`
  if (tenant) filtro += `&tenant_id=eq.${tenant}`
  const pastas = await json(await rest(`simulado_pastas?select=id,nome,tenant_id&${filtro}`))
  if (!Array.isArray(pastas) || pastas.length === 0) { console.error(`Nenhum banco encontrado para "${bancoArg}".`); process.exit(1) }
  if (pastas.length > 1) {
    console.error(`Mais de um banco corresponde a "${bancoArg}" — especifique o id (ou --tenant):`)
    for (const p of pastas) console.error(`  ${p.id}  ${p.nome}  (tenant ${p.tenant_id})`)
    process.exit(1)
  }
  const pasta = pastas[0]

  // 2) Lê a imagem e sobe pro storage (dedupe por hash).
  const buf = readFileSync(imgPath)
  const ext = (extname(imgPath) || '.png').toLowerCase()
  const mime = MIME[ext] || 'application/octet-stream'
  const hash = createHash('sha1').update(buf).digest('hex').slice(0, 16)
  const path = `bancos/${hash}${ext}`
  const up = await fetch(`${URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: { ...H, 'content-type': mime, 'x-upsert': 'true' }, body: buf,
  })
  if (!up.ok) { console.error(`Falha no upload (HTTP ${up.status}):`, await up.text()); process.exit(1) }
  const publicUrl = `${URL}/storage/v1/object/public/${BUCKET}/${path}`

  // 3) Grava a URL na coluna da capa do banco.
  const patch = await rest(`simulado_pastas?id=eq.${pasta.id}`, {
    method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' },
    body: JSON.stringify({ [coluna]: publicUrl }),
  })
  if (!patch.ok) {
    // Tolerante: coluna capa_card_url pode não existir em bases antigas.
    console.error(`Falha ao gravar ${coluna} (HTTP ${patch.status}):`, await patch.text()); process.exit(1)
  }
  console.log(`OK — banco "${pasta.nome}" (${pasta.id})`)
  console.log(`   ${coluna} = ${publicUrl}`)
  console.log('   Todos os simulados deste banco passam a exibir essa capa na trilha.')
}

main().catch((e) => { console.error(e); process.exit(1) })
