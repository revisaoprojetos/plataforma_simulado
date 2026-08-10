// Popula o catálogo simulado_arquivos com o inventário ATUAL do storage:
//   imagens/assets/* (imagens) + pdfs/materiais/{tenant}/* (PDFs) + discursivas/{tenant}/* (anexos).
// Idempotente (não duplica por tenant+bucket+path). DRY-RUN por padrão.
//   DRY-RUN:  node scripts/backfill-simulado-arquivos.mjs
//   APLICAR:  node scripts/backfill-simulado-arquivos.mjs --aplicar
import { readFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim().replace(/^"|"$/g, '')
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }
const APLICAR = process.argv.includes('--aplicar')
const MAIN = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const j = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : [] }
const mime = (nome) => { const e = nome.split('.').pop().toLowerCase(); return ({ jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf' })[e] || 'application/octet-stream' }
console.log(`=== ${APLICAR ? 'APLICANDO' : 'DRY-RUN'} — backfill simulado_arquivos ===`)

// Referências por tenant (p/ resolver o dono de cada imagem em assets, que não tem pasta de tenant)
const tenants = (await j(`simulado_tenants?select=id&limit=200`)).map((t) => t.id)
const refPorTenant = {}
for (const t of tenants) {
  let s = ''
  s += JSON.stringify(await j(`simulado_questoes?select=imagem_url&tenant_id=eq.${t}&limit=10000`))
  s += JSON.stringify(await j(`simulado_cadernos_designer?select=capa_url,config&tenant_id=eq.${t}&limit=10000`))
  s += JSON.stringify(await j(`simulado_tenants?select=tema&id=eq.${t}`))
  s += JSON.stringify(await j(`simulado_pastas?select=capa_url,capa_card_url&tenant_id=eq.${t}&limit=10000`))
  refPorTenant[t] = s
}
const donoDoAsset = (nome) => { for (const t of tenants) if (refPorTenant[t]?.includes(nome)) return t; return MAIN }

const listar = async (bucket, prefix = '') => { const out = []; let off = 0; while (true) { const r = await fetch(`${URL}/storage/v1/object/list/${bucket}`, { method: 'POST', headers: H, body: JSON.stringify({ prefix, limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } }) }); const a = await r.json(); if (!Array.isArray(a) || !a.length) break; out.push(...a); if (a.length < 1000) break; off += 1000 } return out }
const bfs = async (bucket) => { const objs = []; const fila = ['']; while (fila.length) { const pre = fila.shift(); for (const it of await listar(bucket, pre)) { if (it.id === null || it.metadata == null) fila.push(pre ? `${pre}/${it.name}` : it.name); else objs.push({ bucket, path: pre ? `${pre}/${it.name}` : it.name, size: Number(it.metadata?.size ?? 0) }) } } return objs }

// Monta os registros
const registros = []
for (const o of await bfs('imagens')) { // imagens/assets/*
  registros.push({ tenant_id: donoDoAsset(o.path.split('/').pop()), bucket: 'imagens', path: o.path, nome: o.path.split('/').pop(), size: o.size })
}
for (const o of await bfs('pdfs')) { // só materiais/ (PDFs); pdfs/assets são cópias redundantes agora
  if (!o.path.startsWith('materiais/')) continue
  const t = o.path.split('/')[1] // materiais/{tenant}/arquivo
  registros.push({ tenant_id: /^[0-9a-f-]{36}$/i.test(t) ? t : MAIN, bucket: 'pdfs', path: o.path, nome: o.path.split('/').pop(), size: o.size })
}
for (const o of await bfs('discursivas')) {
  const t = o.path.split('/')[0]
  registros.push({ tenant_id: /^[0-9a-f-]{36}$/i.test(t) ? t : MAIN, bucket: 'discursivas', path: o.path, nome: o.path.split('/').pop(), size: o.size })
}
const porBucket = registros.reduce((m, r) => (m[r.bucket] = (m[r.bucket] || 0) + 1, m), {})
console.log('registros a inserir:', registros.length, '|', JSON.stringify(porBucket))
console.log('amostra:', registros.slice(0, 4).map((r) => `${r.bucket}/${r.path} [${r.tenant_id.slice(0, 8)}]`).join(' | '))

if (!APLICAR) { console.log('\n(DRY-RUN — nada inserido.)'); process.exit(0) }

// Idempotência: pula os que já existem (tenant+bucket+path)
const existentes = new Set((await j(`simulado_arquivos?select=tenant_id,bucket,path&limit=100000`)).map((r) => `${r.tenant_id}|${r.bucket}|${r.path}`))
const novos = registros.filter((r) => !existentes.has(`${r.tenant_id}|${r.bucket}|${r.path}`))
const rows = novos.map((r) => ({ tenant_id: r.tenant_id, nome: r.nome, tipo_mime: mime(r.nome), tamanho_bytes: r.size, provider: 'supabase', bucket: r.bucket, path: r.path, publico: true, criado_por: null }))
if (rows.length) {
  const r = await fetch(`${URL}/rest/v1/simulado_arquivos`, { method: 'POST', headers: { ...H, Prefer: 'return=minimal' }, body: JSON.stringify(rows) })
  if (!r.ok) { console.log('ERRO insert:', r.status, (await r.text()).slice(0, 250)); process.exit(1) }
}
console.log(`inseridos: ${rows.length} (pulados ${registros.length - rows.length} já existentes)`)
const total = await j(`simulado_arquivos?select=id&limit=100000`)
console.log('simulado_arquivos agora:', Array.isArray(total) ? total.length : '?', 'registros')
