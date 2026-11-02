// FASE 1 — Cópia Supabase Storage → S3 (Hetzner), bucket a bucket pelo MESMO nome lógico
// (prefixo S3_BUCKET_PREFIX aplicado no destino). Idempotente (pula o que já existe no S3 com
// mesmo tamanho) e retomável (re-run re-lista o S3 e copia só o que falta).
//
// Uso:
//   cd apps/web && node scripts/storage-copiar.mjs --dry-run           (não transfere; só relata)
//   cd apps/web && node scripts/storage-copiar.mjs --apply             (copia de verdade)
//   ...--apply --bucket pdfs                                           (um bucket só)
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { S3Client, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3'

function lerEnv(path) {
  const env = {}
  for (const l of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (!m) continue
    let v = m[2].trim(); if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    env[m[1]] = v
  }
  return env
}
const env = lerEnv('.env.local')
const args = process.argv.slice(2)
const APPLY = args.includes('--apply')
const DRY = !APPLY || args.includes('--dry-run')
const soBucket = (() => { const i = args.indexOf('--bucket'); return i >= 0 ? args[i + 1] : null })()
const CONC = 4

const svc = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const prefixo = env.S3_BUCKET_PREFIX || ''
const fisico = (l) => (prefixo && !l.startsWith(prefixo) ? prefixo + l : l)
const s3 = new S3Client({
  region: env.S3_REGION || 'us-east-1', endpoint: env.S3_ENDPOINT || undefined,
  forcePathStyle: !!env.S3_ENDPOINT, maxAttempts: 3,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID || '', secretAccessKey: env.S3_SECRET_ACCESS_KEY || '' },
})
const fmt = (n) => n >= 1024 ** 3 ? (n / 1024 ** 3).toFixed(2) + ' GB' : n >= 1024 ** 2 ? (n / 1024 ** 2).toFixed(1) + ' MB' : (n / 1024).toFixed(0) + ' KB'

// Lista TODOS os objetos de um bucket do Supabase (recursivo), com size+mime.
async function listarSupabase(bucket) {
  const objetos = []
  const fila = ['']; const vistos = new Set()
  while (fila.length) {
    const pre = fila.shift(); if (vistos.has(pre)) continue; vistos.add(pre)
    let off = 0
    while (true) {
      const { data, error } = await svc.storage.from(bucket).list(pre, { limit: 1000, offset: off, sortBy: { column: 'name', order: 'asc' } })
      if (error || !Array.isArray(data) || data.length === 0) break
      for (const it of data) {
        const nome = it.name; if (!nome || nome === '.emptyFolderPlaceholder') continue
        const full = pre ? `${pre}/${nome}` : nome
        if (it.id === null || it.metadata == null) fila.push(full)
        else objetos.push({ path: full, size: Number(it.metadata?.size ?? 0), mime: it.metadata?.mimetype ?? 'application/octet-stream' })
      }
      if (data.length < 1000) break
      off += 1000
    }
  }
  return objetos
}

// Mapa key→size já existente no S3 (p/ idempotência), via ListObjectsV2.
async function listarS3(bucketFisico) {
  const mapa = new Map(); let token
  do {
    let out
    try { out = await s3.send(new ListObjectsV2Command({ Bucket: bucketFisico, ContinuationToken: token, MaxKeys: 1000 })) }
    catch (e) { if (e?.name === 'NoSuchBucket') return null; throw e }
    for (const o of (out.Contents ?? [])) mapa.set(o.Key, Number(o.Size ?? 0))
    token = out.IsTruncated ? out.NextContinuationToken : undefined
  } while (token)
  return mapa
}

const motivo = (e) => e?.message || e?.name || e?.Code || e?.code || (e ? String(e) : 'erro') || 'erro'

async function baixarSupabase(bucketLogico, path) {
  const { data, error } = await svc.storage.from(bucketLogico).download(path)
  if (error) throw new Error(`download: ${motivo(error)}`)
  if (!data) throw new Error('download: vazio')
  return Buffer.from(await data.arrayBuffer())
}

// Retomável POR OBJETO: downloads do Supabase falham transitoriamente sob concorrência
// (reset de socket/throttle) e vinham sem retry → re-tenta até 4x com backoff.
async function copiarObjeto(bucketLogico, destBucket, obj) {
  let ultima
  for (let tent = 1; tent <= 4; tent++) {
    try {
      const bytes = await baixarSupabase(bucketLogico, obj.path)
      await s3.send(new PutObjectCommand({ Bucket: destBucket, Key: obj.path, Body: bytes, ContentLength: bytes.byteLength, ContentType: obj.mime }))
      return bytes.byteLength
    } catch (e) {
      ultima = e
      if (tent < 4) await new Promise((r) => setTimeout(r, 400 * tent))
    }
  }
  throw ultima
}

async function pool(itens, fn, conc) {
  let i = 0
  const workers = Array.from({ length: conc }, async () => { while (i < itens.length) { const idx = i++; await fn(itens[idx], idx) } })
  await Promise.all(workers)
}

const { data: buckets } = await svc.storage.listBuckets()
const alvos = (buckets ?? []).map((b) => b.name ?? b.id).filter((n) => !soBucket || n === soBucket)
console.log(`\n=== Cópia Supabase→S3 (${DRY ? 'DRY-RUN' : 'APPLY'}) ===  prefixo="${prefixo}"  conc=${CONC}`)

let gTotal = 0, gBytes = 0, gErros = 0
for (const bucket of alvos) {
  const destBucket = fisico(bucket)
  const src = await listarSupabase(bucket)
  if (src.length === 0) { console.log(`\n[${bucket}] vazio — pula`); continue }
  const existentes = await listarS3(destBucket)
  if (existentes === null) { console.log(`\n[${bucket}] ⚠️ destino "${destBucket}" NÃO existe no S3 — CRIAR antes. Pulando.`); continue }
  const faltam = src.filter((o) => existentes.get(o.path) !== o.size)
  const bytesFaltam = faltam.reduce((a, o) => a + o.size, 0)
  console.log(`\n[${bucket}] → ${destBucket}: ${src.length} na origem, ${existentes.size} já no S3 → copiar ${faltam.length} (${fmt(bytesFaltam)})`)
  if (DRY) { faltam.slice(0, 5).forEach((o) => console.log(`    ex: ${o.path} (${fmt(o.size)})`)); gTotal += faltam.length; gBytes += bytesFaltam; continue }

  let feitos = 0, bytes = 0, erros = 0
  await pool(faltam, async (obj) => {
    try { bytes += await copiarObjeto(bucket, destBucket, obj); feitos++ }
    catch (e) { erros++; if (erros <= 10) console.log(`    ! erro ${obj.path}: ${motivo(e)}`) }
    if (feitos % 100 === 0) console.log(`    … ${feitos}/${faltam.length} (${fmt(bytes)})`)
  }, CONC)
  console.log(`[${bucket}] copiados ${feitos}/${faltam.length} (${fmt(bytes)})${erros ? `, ${erros} erros` : ''}`)
  gTotal += feitos; gBytes += bytes; gErros += erros
}
console.log(`\n=== ${DRY ? 'A copiar' : 'Copiado'}: ${gTotal} objetos, ${fmt(gBytes)}${gErros ? `, ${gErros} erros` : ''} ===`)
if (DRY) console.log('(dry-run — nada foi transferido; rode com --apply para copiar)')
process.exit(0)
