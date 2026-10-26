import type { StorageProvider, UploadParams, UploadResult, UploadTicket } from '@/lib/storage/types'
import { StorageError } from '@/lib/storage/types'

// Provider S3 (compatível com AWS S3, Cloudflare R2, MinIO, etc.).
// PRÉ-MONTADO: para ativar →
//   1) pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
//   2) defina no env: STORAGE_PROVIDER=s3, S3_REGION, S3_ENDPOINT (opcional p/ R2/MinIO),
//      S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_BASE_URL (opcional p/ CDN).
// O SDK é importado dinamicamente para não pesar o bundle enquanto não for usado.

// Especificadores indiretos: evitam que o TS/bundler tente resolver os pacotes
// enquanto não estiverem instalados (mantém o `next build` verde).
const PKG_S3 = '@aws-sdk/client-s3'
const PKG_S3_PRESIGN = '@aws-sdk/s3-request-presigner'

// Nomes de bucket no S3 (ex.: Hetzner) são GLOBALMENTE únicos entre TODOS os clientes, então os nomes
// lógicos do sistema ('conteudos'/'imagens'/'pdfs'/'discursivas'/'cadernos') não estão disponíveis.
// Resolvemos isso com um PREFIXO (S3_BUCKET_PREFIX, ex.: 'revisaopge-') aplicado só na borda do provider:
// o resto do código — e a coluna simulado_arquivos.bucket — continuam usando os nomes LÓGICOS, e o
// fallback Supabase segue válido. bucketFisico() faz o mapeamento lógico→físico em TODA operação.
function bucketFisico(logico: string): string {
  const prefixo = process.env.S3_BUCKET_PREFIX ?? ''
  return prefixo && !logico.startsWith(prefixo) ? prefixo + logico : logico
}

async function getClient() {
  let mod: any
  try {
    mod = await import(/* webpackIgnore: true */ PKG_S3)
  } catch {
    throw new StorageError('Provider S3 selecionado, mas @aws-sdk/client-s3 não está instalado. Rode: pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner')
  }
  const client = new mod.S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint: process.env.S3_ENDPOINT || undefined,
    forcePathStyle: !!process.env.S3_ENDPOINT, // R2/MinIO costumam exigir
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
    },
  })
  return { client, mod }
}

export function createS3Provider(): StorageProvider {
  return {
    name: 's3',

    async upload(p: UploadParams): Promise<UploadResult> {
      const { client, mod } = await getClient()
      const body = p.data instanceof ArrayBuffer ? new Uint8Array(p.data) : p.data
      const cacheControl = p.cacheControl ?? (p.upsert ? 'max-age=3600' : 'max-age=31536000')
      await client.send(new mod.PutObjectCommand({
        Bucket: bucketFisico(p.bucket),
        Key: p.path,
        Body: body as Uint8Array,
        ContentType: p.contentType,
        CacheControl: cacheControl,
        ACL: p.publico ? 'public-read' : undefined,
      }))
      const tamanho = (body as Uint8Array).byteLength
      // url pública guarda o bucket LÓGICO (o getPublicUrl mapeia p/ físico) — mantém a URL estável.
      const url = p.publico ? this.getPublicUrl(p.bucket, p.path) : null
      return { provider: 's3', bucket: p.bucket, path: p.path, url, tamanhoBytes: tamanho, contentType: p.contentType }
    },

    async getSignedUrl(bucket, path, expiresInSec = 3600) {
      const { client, mod } = await getClient()
      const presign: any = await import(/* webpackIgnore: true */ PKG_S3_PRESIGN).catch(() => {
        throw new StorageError('Instale @aws-sdk/s3-request-presigner para URLs assinadas S3.')
      })
      return presign.getSignedUrl(client, new mod.GetObjectCommand({ Bucket: bucketFisico(bucket), Key: path }), { expiresIn: expiresInSec })
    },

    getPublicUrl(bucket, path) {
      const fisico = bucketFisico(bucket)
      const base = process.env.S3_PUBLIC_BASE_URL
      if (base) return `${base.replace(/\/$/, '')}/${path}`
      const endpoint = process.env.S3_ENDPOINT
      if (endpoint) return `${endpoint.replace(/\/$/, '')}/${fisico}/${path}`
      return `https://${fisico}.s3.${process.env.S3_REGION ?? 'us-east-1'}.amazonaws.com/${path}`
    },

    async remove(bucket, path) {
      const { client, mod } = await getClient()
      await client.send(new mod.DeleteObjectCommand({ Bucket: bucketFisico(bucket), Key: path }))
    },

    async exists(bucket, path) {
      const { client, mod } = await getClient()
      try {
        await client.send(new mod.HeadObjectCommand({ Bucket: bucketFisico(bucket), Key: path }))
        return true
      } catch {
        return false
      }
    },

    async download(bucket, path) {
      const { client, mod } = await getClient()
      try {
        const out = await client.send(new mod.GetObjectCommand({ Bucket: bucketFisico(bucket), Key: path }))
        const body = out.Body
        if (!body) return null
        // Node stream → bytes (SDK v3 devolve um Readable no Node).
        if (typeof body.transformToByteArray === 'function') return await body.transformToByteArray()
        const chunks: Buffer[] = []
        for await (const c of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(c))
        return new Uint8Array(Buffer.concat(chunks))
      } catch {
        return null
      }
    },

    async criarUploadTicket(bucket, path, contentType): Promise<UploadTicket> {
      const { client, mod } = await getClient()
      const presign: any = await import(/* webpackIgnore: true */ PKG_S3_PRESIGN).catch(() => {
        throw new StorageError('Instale @aws-sdk/s3-request-presigner para upload direto S3.')
      })
      const url = await presign.getSignedUrl(
        client,
        new mod.PutObjectCommand({ Bucket: bucketFisico(bucket), Key: path, ContentType: contentType }),
        { expiresIn: 3600 },
      )
      return { kind: 's3-put', bucket, path, url, headers: contentType ? { 'content-type': contentType } : undefined }
    },
  }
}
