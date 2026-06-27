import type { StorageProvider, UploadParams, UploadResult } from '@/lib/storage/types'
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
      await client.send(new mod.PutObjectCommand({
        Bucket: p.bucket,
        Key: p.path,
        Body: body as Uint8Array,
        ContentType: p.contentType,
        ACL: p.publico ? 'public-read' : undefined,
      }))
      const tamanho = (body as Uint8Array).byteLength
      const url = p.publico ? this.getPublicUrl(p.bucket, p.path) : null
      return { provider: 's3', bucket: p.bucket, path: p.path, url, tamanhoBytes: tamanho, contentType: p.contentType }
    },

    async getSignedUrl(bucket, path, expiresInSec = 3600) {
      const { client, mod } = await getClient()
      const presign: any = await import(/* webpackIgnore: true */ PKG_S3_PRESIGN).catch(() => {
        throw new StorageError('Instale @aws-sdk/s3-request-presigner para URLs assinadas S3.')
      })
      return presign.getSignedUrl(client, new mod.GetObjectCommand({ Bucket: bucket, Key: path }), { expiresIn: expiresInSec })
    },

    getPublicUrl(bucket, path) {
      const base = process.env.S3_PUBLIC_BASE_URL
      if (base) return `${base.replace(/\/$/, '')}/${path}`
      const endpoint = process.env.S3_ENDPOINT
      if (endpoint) return `${endpoint.replace(/\/$/, '')}/${bucket}/${path}`
      return `https://${bucket}.s3.${process.env.S3_REGION ?? 'us-east-1'}.amazonaws.com/${path}`
    },

    async remove(bucket, path) {
      const { client, mod } = await getClient()
      await client.send(new mod.DeleteObjectCommand({ Bucket: bucket, Key: path }))
    },
  }
}
