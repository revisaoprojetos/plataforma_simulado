import type { StorageProvider } from '@/lib/storage/types'

// Leitura com FALLBACK ao Supabase, usada quando STORAGE_PROVIDER=s3 (migração Hetzner em andamento).
// Por que existe: a cópia Supabase→Hetzner é um instantâneo; uploads feitos depois dela existem SÓ no Supabase
// (e nada é apagado lá). No S3 puro, esses documentos davam 404 / "não foi possível abrir" e o editor
// (que baixa o .docx pelo storage) parava. Com o fallback, o objeto que ainda não está no Hetzner é lido do
// Supabase — sem erro p/ o usuário. ESCRITAS vão SEMPRE só p/ o primário (novos uploads já nascem no Hetzner);
// NUNCA apaga nem escreve no Supabase. Desligue com STORAGE_FALLBACK_SUPABASE=off quando a cópia estiver 100%.
//
// OBSERVABILIDADE (decidir quando desligar): cada leitura que CAI no fallback incrementa um contador em memória
// (por processo) e emite um console.warn AMOSTRADO (1ª ocorrência e depois a cada 25ª) com o total acumulado.
// Procure nos logs do serviço web por "[storage] fallback-supabase". Se ficar dias sem aparecer, é seguro desligar.
// Sem I/O extra por request (só contador + warn amostrado).

const TTL_MS = 10 * 60_000
const MAX = 5000
// cache só de existência POSITIVA no primário (evita 1 HEAD por URL assinada); negativo não cacheia p/ achar
// o objeto assim que a cópia do delta rodar.
const noPrimario = new Map<string, number>()
const chave = (b: string, p: string) => `${b}\u0000${p}`

const AMOSTRA = 25
const contagem = { total: 0, porOperacao: {} as Record<string, number>, desde: new Date().toISOString(), ultimo: null as string | null }

/** Quantas leituras caíram no fallback Supabase neste processo (p/ decidir o desligamento). */
export function estatisticasFallback() {
  return { ...contagem, porOperacao: { ...contagem.porOperacao } }
}

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
  const aviso = (op: string, bucket: string, path: string) => {
    contagem.total++
    contagem.porOperacao[op] = (contagem.porOperacao[op] ?? 0) + 1
    contagem.ultimo = `${bucket}/${path}`
    if (contagem.total === 1 || contagem.total % AMOSTRA === 0) {
      console.warn(`[storage] fallback-supabase total=${contagem.total} op=${op} ${bucket}/${path} (ausente no ${primario.name}; lendo do Supabase)`)
    }
  }

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

    // Copy: se a origem ainda só existe no Supabase, materializa no primário (download do fallback + upload) — nunca escreve no Supabase.
    async copy(bucket, de, para) {
      if (await existeNoPrimario(bucket, de)) return primario.copy(bucket, de, para)
      aviso('copy', bucket, de)
      const bytes = await secundario().download(bucket, de)
      if (!bytes) throw new Error(`copy: origem ${bucket}/${de} não encontrada`)
      await primario.upload({ bucket, path: para, data: bytes, contentType: 'application/octet-stream', upsert: true })
    },
  }
}
