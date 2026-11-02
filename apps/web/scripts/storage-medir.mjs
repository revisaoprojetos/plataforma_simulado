// FASE 0 — Medição READ-ONLY do Supabase Storage (nº de objetos + bytes por bucket).
// Uso: cd apps/web && node scripts/storage-medir.mjs
// Zero escrita: só listBuckets + .list() recursivo. Base para dimensionar a cópia Supabase→S3.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function lerEnv(path) {
  const env = {}
  for (const linha of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    let v = m[2].trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    env[m[1]] = v
  }
  return env
}

const env = lerEnv('.env.local')
const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local'); process.exit(1) }
const svc = createClient(url, key, { auth: { persistSession: false } })

const fmtBytes = (n) => {
  if (n >= 1024 ** 3) return (n / 1024 ** 3).toFixed(2) + ' GB'
  if (n >= 1024 ** 2) return (n / 1024 ** 2).toFixed(1) + ' MB'
  if (n >= 1024) return (n / 1024).toFixed(0) + ' KB'
  return n + ' B'
}

async function listarPrefixo(bucket, prefix) {
  const out = []
  let off = 0
  while (true) {
    const { data, error } = await svc.storage.from(bucket).list(prefix, { limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } })
    if (error) { console.error(`  ! erro listando ${bucket}/${prefix}: ${error.message}`); break }
    if (!Array.isArray(data) || data.length === 0) break
    out.push(...data)
    if (data.length < 1000) break
    off += 1000
  }
  return out
}

// BFS recursivo: pastas voltam com id===null/metadata==null → recursa. Soma metadata.size.
async function medirBucket(bucket) {
  let objetos = 0, bytes = 0
  const porTopo = new Map() // 1º segmento do path → {objs, bytes}
  const fila = ['']
  const vistos = new Set()
  while (fila.length) {
    const pre = fila.shift()
    if (vistos.has(pre)) continue
    vistos.add(pre)
    for (const it of await listarPrefixo(bucket, pre)) {
      const nome = it.name
      if (!nome || nome === '.emptyFolderPlaceholder') continue
      const full = pre ? `${pre}/${nome}` : nome
      if (it.id === null || it.metadata == null) { fila.push(full); continue }
      const sz = Number(it.metadata?.size ?? 0)
      objetos++; bytes += sz
      const topo = full.split('/')[0]
      const acc = porTopo.get(topo) ?? { objs: 0, bytes: 0 }
      acc.objs++; acc.bytes += sz; porTopo.set(topo, acc)
    }
  }
  return { objetos, bytes, porTopo }
}

const { data: buckets, error } = await svc.storage.listBuckets()
if (error) { console.error('Erro listBuckets:', error.message); process.exit(1) }

console.log('\n=== Supabase Storage — medição (READ-ONLY) ===')
console.log('Projeto:', url)
let totObj = 0, totBytes = 0
const resumo = []
for (const b of buckets ?? []) {
  const nome = b.name ?? b.id
  process.stdout.write(`\n[${nome}] (public=${!!b.public}) medindo… `)
  const r = await medirBucket(nome)
  totObj += r.objetos; totBytes += r.bytes
  resumo.push({ nome, publico: !!b.public, ...r })
  console.log(`${r.objetos} objetos, ${fmtBytes(r.bytes)}`)
  const tops = [...r.porTopo.entries()].sort((a, c) => c[1].bytes - a[1].bytes).slice(0, 8)
  for (const [topo, acc] of tops) console.log(`    ${topo}/ → ${acc.objs} obj, ${fmtBytes(acc.bytes)}`)
}

console.log('\n=== RESUMO ===')
for (const r of resumo.sort((a, c) => c.bytes - a.bytes)) {
  console.log(`  ${r.nome.padEnd(16)} ${String(r.objetos).padStart(7)} obj   ${fmtBytes(r.bytes).padStart(10)}`)
}
console.log(`  ${'TOTAL'.padEnd(16)} ${String(totObj).padStart(7)} obj   ${fmtBytes(totBytes).padStart(10)}`)
console.log('')
