import { createAdminClient } from '@/lib/supabase/server'
import type { StorageProvider, UploadParams, UploadResult, UploadTicket } from '@/lib/storage/types'
import { StorageError } from '@/lib/storage/types'

/** Provider de Supabase Storage (já funcional — Supabase é dependência do app). */
export function createSupabaseProvider(): StorageProvider {
  const sb = () => createAdminClient()

  return {
    name: 'supabase',

    async upload(p: UploadParams): Promise<UploadResult> {
      const body = p.data instanceof ArrayBuffer ? new Uint8Array(p.data) : p.data
      // Cache longo p/ caminho imutável (sem upsert → path único por conteúdo) = 1 ano; mutável (upsert
      // no mesmo path) = 1h p/ não servir versão velha. Corta MUITO egress de imagens/PDFs re-baixados.
      const cacheControl = p.cacheControl ?? (p.upsert ? '3600' : '31536000')
      const { error } = await sb().storage.from(p.bucket).upload(p.path, body as Uint8Array, {
        contentType: p.contentType,
        upsert: p.upsert ?? false,
        cacheControl,
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

    async exists(bucket, path) {
      // Existência via .list() (NUNCA HEAD na URL: o CDN devolve 200 cacheado mesmo sem o objeto).
      const barra = path.lastIndexOf('/')
      const dir = barra >= 0 ? path.slice(0, barra) : ''
      const base = barra >= 0 ? path.slice(barra + 1) : path
      const { data } = await sb().storage.from(bucket).list(dir, { search: base, limit: 100 })
      return Array.isArray(data) && data.some((f: any) => f.name === base)
    },

    async download(bucket, path) {
      const { data, error } = await sb().storage.from(bucket).download(path)
      if (error || !data) return null
      return new Uint8Array(await data.arrayBuffer())
    },

    async criarUploadTicket(bucket, path): Promise<UploadTicket> {
      const { data, error } = await sb().storage.from(bucket).createSignedUploadUrl(path)
      if (error || !data) throw new StorageError(error?.message ?? 'Falha ao preparar o upload.')
      return { kind: 'supabase', bucket, path, token: data.token, signedUrl: data.signedUrl }
    },
  }
}
