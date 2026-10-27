// Storage do WORKER — respeita STORAGE_PROVIDER (supabase default | s3), espelhando a abstração da web
// (apps/web/lib/storage). O worker é um runtime isolado; aqui replicamos só o que ele precisa: upload
// público + URL pública. Assim os PDFs gerados (relatório/caderno) vão para o MESMO storage que o resto do
// sistema quando o provider for trocado p/ s3 — fechando o bypass que mandava tudo p/ o Supabase.
//
// O SDK S3 é importado DINAMICAMENTE por especificador indireto → o `tsc` fica verde mesmo sem o pacote
// instalado localmente; no Docker o `npm install` traz o @aws-sdk/client-s3 e o import resolve em runtime.
import { createClient } from '@supabase/supabase-js'

const PROVIDER = (process.env.STORAGE_PROVIDER ?? 'supabase').toLowerCase()
const PKG_S3 = '@aws-sdk/client-s3'

const supabase = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')

// Nomes de bucket no S3 (Hetzner) são globais entre clientes → aplicamos um PREFIXO (S3_BUCKET_PREFIX) só
// na borda. O resto do código continua usando o nome LÓGICO ('pdfs'). Igual ao provider da web.
function bucketFisico(logico: string): string {
  const p = process.env.S3_BUCKET_PREFIX ?? ''
  return p && !logico.startsWith(p) ? p + logico : logico
}

let _s3: { client: any; mod: any } | null = null
async function s3Client() {
  if (_s3) return _s3
  const mod: any = await import(PKG_S3 as any)
  const client = new mod.S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT, // R2/MinIO/Hetzner costumam exigir
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  })
  _s3 = { client, mod }
  return _s3
}

export function storageProvider(): string {
  return PROVIDER
}

/** URL pública de um arquivo. PDF_PUBLIC_BASE (CDN dedicada p/ PDFs) tem prioridade em qualquer provider. */
export function urlPublica(bucket: string, path: string): string {
  const pdfBase = process.env.PDF_PUBLIC_BASE
  if (pdfBase) return `${pdfBase.replace(/\/$/, '')}/${path}`
  if (PROVIDER === 's3') {
    const fisico = bucketFisico(bucket)
    const base = process.env.S3_PUBLIC_BASE_URL
    if (base) return `${base.replace(/\/$/, '')}/${path}`
    const endpoint = process.env.S3_ENDPOINT
    if (endpoint) return `${endpoint.replace(/\/$/, '')}/${fisico}/${path}`
    return `https://${fisico}.s3.${process.env.S3_REGION ?? 'us-east-1'}.amazonaws.com/${path}`
  }
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl
}

/** Faz upload PÚBLICO (upsert) no provider ativo e devolve a URL pública. Nunca lança — retorna {ok,erro}. */
export async function uploadPublico(opts: {
  bucket: string; path: string; body: Buffer | Uint8Array; contentType: string; cacheSeconds?: number
}): Promise<{ ok: boolean; url: string | null; erro?: string }> {
  const { bucket, path, body, contentType } = opts
  const cacheSeconds = opts.cacheSeconds ?? 31536000
  try {
    if (PROVIDER === 's3') {
      const { client, mod } = await s3Client()
      await client.send(new mod.PutObjectCommand({
        Bucket: bucketFisico(bucket), Key: path, Body: body as Uint8Array,
        ContentType: contentType, CacheControl: `max-age=${cacheSeconds}`, ACL: 'public-read',
      }))
    } else {
      const { error } = await supabase.storage.from(bucket).upload(path, body as any, {
        contentType, upsert: true, cacheControl: String(cacheSeconds),
      })
      if (error) return { ok: false, url: null, erro: error.message }
    }
    return { ok: true, url: urlPublica(bucket, path) }
  } catch (e: any) {
    return { ok: false, url: null, erro: e?.message || String(e) }
  }
}

// Log de arranque (1x) → dá para confirmar no log do worker qual storage está ativo.
console.log(`[storage] provider = ${PROVIDER}${PROVIDER === 's3' ? ` (prefixo=${process.env.S3_BUCKET_PREFIX ?? ''}, endpoint=${process.env.S3_ENDPOINT ?? 'aws'})` : ''}`)
