import type { StorageProvider } from '@/lib/storage/types'

// Leitura com FALLBACK ao Supabase, usada quando STORAGE_PROVIDER=s3 (migração Hetzner em andamento).
// Por que existe: a cópia Supabase→Hetzner é um instantâneo; uploads feitos depois dela existem SÓ no Supabase
// (e nada é apagado lá). No S3 puro, esses documentos davam 404 / "não foi possível abrir" e o editor
// (que baixa o .docx pelo storage) parava. Com o fallback, o objeto que ainda não está no Hetzner é lido do
// Supabase — sem erro p/ o usuário. ESCRITAS vão SEMPRE só p/ o primário (novos uploads já nascem no Hetzner);
// NUNCA apaga nem escreve no Supabase. Desligue com STORAGE_FALLBACK_SUPABASE=off quando a cópia estiver 100%.

const TTL_MS = 10 * 60_000
const MAX = 5000
// cache só de existência POSITIVA no primário (evita 1 HEAD por URL assinada); negativo não cacheia p/ achar
// o objeto assim que a cópia do delta rodar.
const noPrimario = new Map<string, number>()
const chave = (b: string, p: string) => `${b}\u0000${p}`

function lembrar(k: string) {
  if (noPrimario.size >= MAX) noPrimario.delete(noPrimario.keys().next().value as string)
  noPrimario.set(k, Date.now() + TTL_MS)
}

export function comFallbackSupabase(primario: StorageProvider, secundario: () => StorageProvider): StorageProvider {
  const existeNoPrimario = async (bucket: string, path: string): Promise<boolean> => {
    const k = chave(bucket, path)
    const ate = noPrimario.get(k)
    if (ate && ate > Date.now()) return true
    const ok = await primario.exists(bucket, path).catch(() => false)
    if (ok) lembrar(k)
    return ok
  }
  const aviso = (op: string, bucket: string, path: string) =>
    console.warn(`[storage] ${op}: ${bucket}/${path} ausente no ${primario.name} — lendo do Supabase (fallback)`)

  return {
    ...primario,

    async getSignedUrl(bucket, path, expiresInSec) {
      if (await existeNoPrimario(bucket, path)) return primario.getSignedUrl(bucket, path, expiresInSec)
      aviso('getSignedUrl', bucket, path)
      return secundario().getSignedUrl(bucket, path, expiresInSec)
    },

    async download(bucket, path) {
      const r = await primario.download(bucket, path)
      if (r) return r
      aviso('download', bucket, path)
      return secundario().download(bucket, path)
    },

    async exists(bucket, path) {
      if (await existeNoPrimario(bucket, path)) return true
      return secundario().exists(bucket, path).catch(() => false)
    },
  }
}
