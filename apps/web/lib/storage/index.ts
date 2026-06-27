import type { StorageProvider, StorageProviderName, UploadResult } from '@/lib/storage/types'
import { createSupabaseProvider } from '@/lib/storage/providers/supabase'
import { createS3Provider } from '@/lib/storage/providers/s3'
import { createGcsProvider } from '@/lib/storage/providers/gcs'
import { validateFile, type ValidateOptions } from '@/lib/storage/validate'
import { createAdminClient } from '@/lib/supabase/server'

export * from '@/lib/storage/types'
export { validateFile, sniffMime, PRESETS } from '@/lib/storage/validate'

let _cached: StorageProvider | null = null

/**
 * Retorna o provider de storage configurado (STORAGE_PROVIDER no env).
 * Default: 'supabase'. Trocar para 's3' ou 'gcs' não exige mudar código —
 * só instalar o SDK do provider e definir as credenciais.
 */
export function getStorage(): StorageProvider {
  if (_cached) return _cached
  const name = (process.env.STORAGE_PROVIDER as StorageProviderName) ?? 'supabase'
  switch (name) {
    case 's3':
      _cached = createS3Provider()
      break
    case 'gcs':
      _cached = createGcsProvider()
      break
    default:
      _cached = createSupabaseProvider()
  }
  return _cached
}

export interface UploadArquivoParams {
  tenantId: string
  bucket: string
  path: string
  data: Buffer | Uint8Array | ArrayBuffer
  contentType: string
  nome: string
  publico?: boolean
  validar?: ValidateOptions
  criadoPor?: string | null
}

/**
 * Fluxo completo: valida (opcional) → faz upload no provider → registra em
 * simulado_arquivos. Retorna o upload + o id do registro.
 *
 * NÃO está ligado a nenhuma feature ainda — é o ponto de entrada pronto para uso.
 */
export async function uploadArquivo(
  p: UploadArquivoParams,
): Promise<{ ok: boolean; error?: string; upload?: UploadResult; arquivoId?: string }> {
  if (p.validar) {
    const v = validateFile(p.data, p.contentType, p.validar)
    if (!v.ok) return { ok: false, error: v.error }
  }

  const storage = getStorage()
  let upload: UploadResult
  try {
    upload = await storage.upload({
      bucket: p.bucket,
      path: p.path,
      data: p.data,
      contentType: p.contentType,
      publico: p.publico,
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Falha no upload.' }
  }

  // Registra metadados (camada de storage abstrata do plano: provider/bucket/path).
  const svc = createAdminClient()
  const { data, error } = await svc
    .from('simulado_arquivos')
    .insert({
      tenant_id: p.tenantId,
      nome: p.nome,
      tipo_mime: p.contentType,
      tamanho_bytes: upload.tamanhoBytes,
      provider: upload.provider,
      bucket: upload.bucket,
      path: upload.path,
      publico: p.publico ?? false,
      criado_por: p.criadoPor ?? null,
    })
    .select('id')
    .single()
  if (error) return { ok: true, upload } // upload ok, mas registro falhou (não bloqueia)

  return { ok: true, upload, arquivoId: data.id }
}
