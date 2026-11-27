import { getStorage } from '@/lib/storage'

// Helpers de JSON no storage ATIVO (supabase | s3/Hetzner) — usados por caches/backups do Cronograma Adaptativo.
// Tudo passa por getStorage() (nunca `svc.storage` direto), então segue o STORAGE_PROVIDER.

/** Lê e parseia um JSON do bucket (null se não existir / inválido). */
export async function lerJsonStorage<T = unknown>(bucket: string, path: string): Promise<T | null> {
  try {
    const bytes = await getStorage().download(bucket, path)
    if (!bytes) return null
    return JSON.parse(Buffer.from(bytes).toString('utf8')) as T
  } catch {
    return null
  }
}

/**
 * Grava um JSON no bucket. `sobrescrever=false` NÃO sobrescreve objeto existente (o S3 não tem "upsert:false"
 * nativo: checamos antes) — usado em backups que preservam o estado ORIGINAL. Retorna true se gravou.
 */
export async function gravarJsonStorage(bucket: string, path: string, obj: unknown, sobrescrever: boolean): Promise<boolean> {
  try {
    const st = getStorage()
    if (!sobrescrever && (await st.exists(bucket, path))) return false
    await st.upload({
      bucket, path, data: Buffer.from(JSON.stringify(obj)), contentType: 'application/json',
      upsert: sobrescrever, publico: false,
    })
    return true
  } catch {
    return false
  }
}
