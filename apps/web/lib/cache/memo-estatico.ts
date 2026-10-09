import 'server-only'
import { remember } from './relatorio-cache'

/**
 * Cache de conteúdo ESTÁTICO durante um simulado ao vivo (questões/alternativas/enunciados) — dados que
 * NÃO mudam enquanto a prova acontece. Combina duas camadas:
 *   1) `remember()` → Redis (compartilhado entre réplicas) quando disponível.
 *   2) cache EM PROCESSO de vida LONGA (por réplica) — a diferença crucial em relação ao fallback curto
 *      (2 min) do `remember()`: protege o banco MESMO SEM REDIS. Com 1500 alunos no mesmo simulado, cada
 *      réplica lê o conteúdo ~1× por TTL em vez de 1× por aluno.
 *
 * Seguro porque o conteúdo é estático no período da prova; anulação/alteração de gabarito durante a prova
 * reflete em ≤ TTL, e a RE-CORREÇÃO server-side recalcula a pontuação de qualquer forma. Degrada com
 * elegância (qualquer erro → computa direto). Só serializa valores JSON (via remember).
 */

const mem = new Map<string, { v: unknown; exp: number }>()
const MAX = 500

export async function memoEstatico<T>(chave: string, ttlSeg: number, calcular: () => Promise<T>): Promise<T> {
  const agora = Date.now()
  const hit = mem.get(chave)
  if (hit && hit.exp > agora) return hit.v as T

  // remember() cuida do Redis (entre réplicas); aqui adicionamos a camada em-processo de vida longa.
  const v = await remember(chave, ttlSeg, calcular)
  if (v !== undefined) {
    if (mem.size >= MAX) { const k = mem.keys().next().value; if (k) mem.delete(k) }
    mem.set(chave, { v, exp: agora + ttlSeg * 1000 })
  }
  return v
}

/** Remove uma chave do cache em processo (o do Redis expira por TTL / invalidação própria). */
export function esquecerEstatico(chave: string): void {
  mem.delete(chave)
}
