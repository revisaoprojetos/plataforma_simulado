import type { StorageProvider, UploadParams, UploadResult, UploadTicket } from '@/lib/storage/types'
import { StorageError } from '@/lib/storage/types'

// Provider Google Cloud Storage.
// PRÉ-MONTADO: para ativar →
//   1) pnpm add @google-cloud/storage
//   2) defina no env: STORAGE_PROVIDER=gcs, GCS_PROJECT_ID,
//      GCS_CLIENT_EMAIL, GCS_PRIVATE_KEY (com \n escapados) — ou GOOGLE_APPLICATION_CREDENTIALS.

// Especificador indireto: evita o TS/bundler resolver o pacote antes de instalado.
const PKG_GCS = '@google-cloud/storage'

async function getBucket(bucketName: string) {
  let mod: any
  try {
    mod = await import(/* webpackIgnore: true */ PKG_GCS)
  } catch {
    throw new StorageError('Provider GCS selecionado, mas @google-cloud/storage não está instalado. Rode: pnpm add @google-cloud/storage')
  }
  const credentials = process.env.GCS_CLIENT_EMAIL
    ? {
        client_email: process.env.GCS_CLIENT_EMAIL,
        private_key: (process.env.GCS_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
      }
    : undefined
  const storage = new mod.Storage({ projectId: process.env.GCS_PROJECT_ID, credentials })
  return storage.bucket(bucketName)
}

export function createGcsProvider(): StorageProvider {
  return {
    name: 'gcs',

    async upload(p: UploadParams): Promise<UploadResult> {
      const bucket = await getBucket(p.bucket)
      const body = p.data instanceof ArrayBuffer ? Buffer.from(new Uint8Array(p.data)) : Buffer.from(p.data as Uint8Array)
      const file = bucket.file(p.path)
      await file.save(body, { contentType: p.contentType, resumable: false })
      if (p.publico) await file.makePublic().catch(() => {})
      const url = p.publico ? this.getPublicUrl(p.bucket, p.path) : null
      return { provider: 'gcs', bucket: p.bucket, path: p.path, url, tamanhoBytes: body.byteLength, contentType: p.contentType }
    },

    async getSignedUrl(bucket, path, expiresInSec = 3600) {
      const b = await getBucket(bucket)
      const [url] = await b.file(path).getSignedUrl({ action: 'read', expires: Date.now() + expiresInSec * 1000 })
      return url
    },

    getPublicUrl(bucket, path) {
      return `https://storage.googleapis.com/${bucket}/${path}`
    },

    async remove(bucket, path) {
      const b = await getBucket(bucket)
      await b.file(path).delete({ ignoreNotFound: true })
    },

    async exists(bucket, path) {
      const b = await getBucket(bucket)
      const [ok] = await b.file(path).exists()
      return !!ok
    },

    async download(bucket, path) {
      const b = await getBucket(bucket)
      try {
        const [buf] = await b.file(path).download()
        return new Uint8Array(buf)
      } catch {
        return null
      }
    },

    async criarUploadTicket(bucket, path, contentType): Promise<UploadTicket> {
      const b = await getBucket(bucket)
      const [url] = await b.file(path).getSignedUrl({
        action: 'write', version: 'v4', expires: Date.now() + 3600 * 1000, contentType,
      })
      return { kind: 's3-put', bucket, path, url, headers: contentType ? { 'content-type': contentType } : undefined }
    },
  }
}
