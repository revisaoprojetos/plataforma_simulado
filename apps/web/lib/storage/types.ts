// Camada de storage abstrata (Supabase / S3 / GCS por env).
// PRÉ-MONTADA: ainda não está ligada a nenhuma feature. Para ativar, basta
// definir STORAGE_PROVIDER + as credenciais e usar getStorage() onde precisar.

export type StorageProviderName = 'supabase' | 's3' | 'gcs'

export interface UploadParams {
  /** Bucket (Supabase/GCS) ou bucket S3. */
  bucket: string
  /** Caminho dentro do bucket, ex.: 'tenant123/questoes/abc.png'. */
  path: string
  /** Conteúdo do arquivo. */
  data: Buffer | Uint8Array | ArrayBuffer
  /** MIME já validado (use validateFile antes). */
  contentType: string
  /** Se público, getUrl retorna URL pública; senão, URL assinada. */
  publico?: boolean
  /** Sobrescrever se já existir (default false). */
  upsert?: boolean
}

export interface UploadResult {
  provider: StorageProviderName
  bucket: string
  path: string
  /** URL pública (se publico) ou null. */
  url: string | null
  tamanhoBytes: number
  contentType: string
}

export interface StorageProvider {
  readonly name: StorageProviderName
  upload(p: UploadParams): Promise<UploadResult>
  /** URL assinada temporária (para arquivos privados). */
  getSignedUrl(bucket: string, path: string, expiresInSec?: number): Promise<string>
  /** URL pública direta (para buckets/arquivos públicos). */
  getPublicUrl(bucket: string, path: string): string
  remove(bucket: string, path: string): Promise<void>
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageError'
  }
}
