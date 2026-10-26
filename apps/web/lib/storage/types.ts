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
  /** Cache-Control (segundos) do objeto no Storage. Default: caminho imutável (sem upsert) = 1 ano;
   *  mutável (upsert) = 1h. Cache longo evita re-baixar o mesmo arquivo do Supabase (egress). */
  cacheControl?: string
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

/**
 * Ticket p/ UPLOAD DIRETO do browser (sem passar os bytes pela server action → sem limite de corpo).
 * Discriminado por provider porque a mecânica difere:
 *  - supabase: createSignedUploadUrl → o cliente usa `uploadToSignedUrl(path, token, file)`.
 *  - s3: URL pré-assinada de PUT → o cliente faz `fetch(url, { method:'PUT', body:file, headers })`.
 * O componente de upload trata os dois `kind` (ver biblioteca-client).
 */
export type UploadTicket =
  | { kind: 'supabase'; bucket: string; path: string; token: string; signedUrl: string }
  | { kind: 's3-put'; bucket: string; path: string; url: string; headers?: Record<string, string> }

export interface StorageProvider {
  readonly name: StorageProviderName
  upload(p: UploadParams): Promise<UploadResult>
  /** URL assinada temporária (para arquivos privados). */
  getSignedUrl(bucket: string, path: string, expiresInSec?: number): Promise<string>
  /** URL pública direta (para buckets/arquivos públicos). */
  getPublicUrl(bucket: string, path: string): string
  remove(bucket: string, path: string): Promise<void>
  /** Existe o objeto? (HEAD no S3 / list no Supabase). NUNCA testar existência pela URL (CDN cacheia 200). */
  exists(bucket: string, path: string): Promise<boolean>
  /** Baixa os bytes do objeto (null se não existir / erro). */
  download(bucket: string, path: string): Promise<Uint8Array | null>
  /** Prepara um upload direto do browser (ver UploadTicket). */
  criarUploadTicket(bucket: string, path: string, contentType?: string): Promise<UploadTicket>
}

export class StorageError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageError'
  }
}
