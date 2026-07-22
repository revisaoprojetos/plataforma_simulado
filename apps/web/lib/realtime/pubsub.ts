import 'server-only'
import IORedis from 'ioredis'

/**
 * Pub/Sub via Redis para realtime (Fase 2 do roadmap): substitui o polling do painel "Ao Vivo".
 *
 * Um pequeno sinal "algo mudou no simulado X" é publicado nos pontos de mutação de sessão
 * (entrar, finalizar, auto-encerrar). A rota SSE assina o canal e reemite o resumo atualizado.
 *
 * Degrada com elegância: sem Redis, `publicar` é no-op e a UI cai no polling.
 */

// Publisher: singleton lazy, best-effort (fail-fast se o Redis não estiver conectado).
let pub: IORedis | null = null
function publisher(): IORedis | null {
  if (pub) return pub
  try {
    pub = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    })
    pub.on('error', () => {})
  } catch {
    pub = null
  }
  return pub
}

/** Publica um sinal num canal. Best-effort — nunca lança. */
export async function publicar(canal: string, msg = '1'): Promise<void> {
  const p = publisher()
  if (!p) return
  try { await p.publish(canal, msg) } catch { /* ignora */ }
}

/**
 * Cria uma conexão DEDICADA em modo subscribe (uma conexão em subscribe não pode
 * emitir comandos normais). O chamador (rota SSE) é responsável por fechá-la.
 * Retorna null se o Redis estiver indisponível.
 */
export function criarSubscriber(): IORedis | null {
  try {
    const s = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null, lazyConnect: false })
    s.on('error', () => {})
    return s
  } catch {
    return null
  }
}

/** Canal do painel "Ao Vivo" de um simulado. */
export const canalAoVivo = (simuladoId: string) => `aovivo:${simuladoId}`

/** Atalho: sinaliza que a situação de um simulado mudou (entrou/finalizou/auto-encerrou). */
export async function publicarAoVivo(simuladoId: string): Promise<void> {
  await publicar(canalAoVivo(simuladoId))
}
