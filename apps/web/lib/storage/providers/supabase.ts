import { createAdminClient } from '@/lib/supabase/server'
import type { StorageProvider, UploadParams, UploadResult } from '@/lib/storage/types'
import { StorageError } from '@/lib/storage/types'

/** Provider de Supabase Storage (já funcional — Supabase é dependência do app). */
export function createSupabaseProvider(): StorageProvider {
  const sb = () => createAdminClient()

  return {
    name: 'supabase',

    async upload(p: UploadParams): Promise<UploadResult> {
      const body = p.data instanceof ArrayBuffer ? new Uint8Array(p.data) : p.data
      const { error } = await sb().storage.from(p.bucket).upload(p.path, body as Uint8Array, {
        contentType: p.contentType,
        upsert: p.upsert ?? false,
      })
      if (error) throw new StorageError(error.message)

      const tamanho = body instanceof Uint8Array ? body.byteLength : (body as Buffer).byteLength
      const url = p.publico ? sb().storage.from(p.bucket).getPublicUrl(p.path).data.publicUrl : null
      return { provider: 'supabase', bucket: p.bucket, path: p.path, url, tamanhoBytes: tamanho, contentType: p.contentType }
    },

    async getSignedUrl(bucket, path, expiresInSec = 3600) {
      const { data, error } = await sb().storage.from(bucket).createSignedUrl(path, expiresInSec)
      if (error || !data) throw new StorageError(error?.message ?? 'Falha ao gerar URL assinada.')
      return data.signedUrl
    },

    getPublicUrl(bucket, path) {
      return createAdminClient().storage.from(bucket).getPublicUrl(path).data.publicUrl
    },

    async remove(bucket, path) {
      const { error } = await sb().storage.from(bucket).remove([path])
      if (error) throw new StorageError(error.message)
    },
  }
}
