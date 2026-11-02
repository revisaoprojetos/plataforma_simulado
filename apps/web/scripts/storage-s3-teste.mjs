// FASE 0 — Verificação de conectividade do S3 (Hetzner). Round-trip de 1 objeto de teste.
// Timeout POR CHAMADA (AbortSignal.timeout) + maxAttempts:1 → nunca pendura.
// Uso: cd apps/web && node scripts/storage-s3-teste.mjs
import { readFileSync } from 'node:fs'
import {
  S3Client, ListBucketsCommand, HeadBucketCommand, PutObjectCommand,
  HeadObjectCommand, GetObjectCommand, DeleteObjectCommand,
} from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

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
const endpoint = env.S3_ENDPOINT || undefined
const region = env.S3_REGION || 'us-east-1'
const prefixo = env.S3_BUCKET_PREFIX || ''
const contentLogico = env.STORAGE_CONTENT_BUCKET || 'conteudos'
const fisico = (l) => (prefixo && !l.startsWith(prefixo) ? prefixo + l : l)
const alvo = fisico(contentLogico)

console.log('\n=== S3 (Hetzner) — verificação ===')
console.log('endpoint:', endpoint, '| region:', region, '| prefixo:', JSON.stringify(prefixo), '| alvo:', alvo)

const client = new S3Client({
  region, endpoint, forcePathStyle: !!endpoint, maxAttempts: 1,
  credentials: { accessKeyId: env.S3_ACCESS_KEY_ID || '', secretAccessKey: env.S3_SECRET_ACCESS_KEY || '' },
})
const det = (e) => JSON.stringify({ name: e?.name, code: e?.Code, msg: e?.message, http: e?.$metadata?.httpStatusCode })
const envia = (cmd, ms = 20000) => client.send(cmd, { abortSignal: AbortSignal.timeout(ms) })
const passo = async (nome, fn) => {
  const t = Date.now()
  try { const r = await fn(); console.log(`[${nome}] OK (${Date.now() - t}ms)`); return r }
  catch (e) { console.log(`[${nome}] FALHOU (${Date.now() - t}ms):`, det(e)); return undefined }
}

await passo('ListBuckets', async () => {
  const out = await envia(new ListBucketsCommand({}))
  console.log('   buckets:', (out.Buckets ?? []).map((b) => b.Name).join(', '))
})
const head = await passo('HeadBucket ' + alvo, () => envia(new HeadBucketCommand({ Bucket: alvo })))
if (head === undefined && !process.env.FORCE) { console.log('\n⚠️  bucket inacessível — paro aqui.'); process.exit(0) }

const Key = `storage-migracao/_selfcheck_${Date.now()}.txt`
const bytes = Buffer.from(`selfcheck ${new Date().toISOString()}`, 'utf8')
const put = await passo('Put(bytes)', () => envia(new PutObjectCommand({
  Bucket: alvo, Key, Body: bytes, ContentLength: bytes.byteLength, ContentType: 'text/plain',
})))
if (put !== undefined) {
  await passo('Head obj', () => envia(new HeadObjectCommand({ Bucket: alvo, Key })))
  await passo('Get', async () => { const o = await envia(new GetObjectCommand({ Bucket: alvo, Key })); await o.Body.transformToByteArray() })
  await passo('SignedUrl+fetch', async () => {
    const u = await getSignedUrl(client, new GetObjectCommand({ Bucket: alvo, Key }), { expiresIn: 120 })
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) }); console.log('   HTTP', r.status); await r.text()
  })
}
await passo('Delete', () => envia(new DeleteObjectCommand({ Bucket: alvo, Key })))
console.log(put !== undefined ? '\n✅ S3 grava/lê OK.' : '\n❌ PUT falhou — ver erro acima.')
process.exit(0)
