/**
 * Detecta UMA vez que um objeto de migração PENDENTE (coluna/tabela/RPC) não existe e evita re-tentar a query a cada request
 * (cada tentativa vira um ERROR no log do Postgres). A ausência fica memorizada por 10 min por processo; depois disso
 * tenta de novo UMA vez (se a migração já foi aplicada, passa a funcionar sozinho). Só em memória: nunca lança.
 */
const TTL_MS = 10 * 60 * 1000
const AUSENTES = new Map<string, number>()

/** `true` se o recurso foi dado como ausente há menos de 10 min (não tente a query). */
export function recursoAusente(chave: string): boolean {
  const ate = AUSENTES.get(chave)
  if (!ate) return false
  if (ate > Date.now()) return true
  AUSENTES.delete(chave)
  return false
}

/** Memoriza a ausência do recurso por 10 min. */
export function marcarAusente(chave: string): void {
  AUSENTES.set(chave, Date.now() + TTL_MS)
}

/** `true` se a mensagem de erro indica objeto inexistente (coluna/tabela/função/schema cache do PostgREST). */
export function erroDeObjetoAusente(msg: string | null | undefined): boolean {
  return !!msg && /does not exist|schema cache|could not find|PGRST20[45]|42703|42P01|42883/i.test(msg)
}

/** Atalho: se o erro for de objeto ausente, memoriza a chave. Devolve `true` quando memorizou. */
export function marcarSeAusente(chave: string, msg: string | null | undefined): boolean {
  if (!erroDeObjetoAusente(msg)) return false
  marcarAusente(chave)
  return true
}
