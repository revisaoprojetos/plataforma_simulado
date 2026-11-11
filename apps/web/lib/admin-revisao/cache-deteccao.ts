import 'server-only'

// CACHE DA DETECÇÃO PESADA (Unificar: duplicadas, termos, pastas). Somente servidor.
//  • single-flight: UMA computação por chave, mesmo com N chamadas simultâneas (todas aguardam a mesma Promise);
//  • stale-while-revalidate: passou do TTL mas ainda dentro de `staleMs` → devolve o valor antigo NA HORA e recalcula em segundo plano
//    (o usuário nunca espera a detecção "a frio" depois do 1º cálculo);
//  • armazenado em globalThis (sobrevive ao hot-reload do dev e é compartilhado entre rotas/páginas do mesmo processo);
//  • invalidação por prefixo (as mutações chamam `invalidarDeteccao`).
type Ent = { at: number; v: unknown }
const G = globalThis as unknown as { __deteccaoCache?: { val: Map<string, Ent>; voo: Map<string, Promise<unknown>> } }
const S = (G.__deteccaoCache ??= { val: new Map(), voo: new Map() })

export const TTL_DETECCAO = 8 * 60_000
const STALE_DETECCAO = 60 * 60_000

export async function deteccaoCache<T>(chave: string, calcular: () => Promise<T>, o: { ttl?: number; stale?: number; fresh?: boolean } = {}): Promise<T> {
  const ttl = o.ttl ?? TTL_DETECCAO, stale = o.stale ?? STALE_DETECCAO
  if (o.fresh) { S.val.delete(chave); S.voo.delete(chave) }
  const hit = S.val.get(chave)
  const idade = hit ? Date.now() - hit.at : Infinity
  const iniciar = () => {
    let p = S.voo.get(chave) as Promise<T> | undefined
    if (!p) {
      const eu: Promise<T> = calcular().then((v) => { if (S.voo.get(chave) === eu) S.val.set(chave, { at: Date.now(), v }) /* invalidado no meio do cálculo → não grava */; return v }).finally(() => { if (S.voo.get(chave) === eu) S.voo.delete(chave) })
      p = eu; S.voo.set(chave, eu)
    }
    return p
  }
  if (hit && idade < ttl) return hit.v as T
  if (hit && idade < stale) { void iniciar().catch(() => {}); return hit.v as T }
  return iniciar()
}

/** Aquece a chave sem esperar (fire-and-forget; erros ignorados). */
export function aquecerDeteccao<T>(chave: string, calcular: () => Promise<T>) { void deteccaoCache(chave, calcular).catch(() => {}) }

export function invalidarDeteccao(prefixo: string) {
  for (const k of [...S.val.keys()]) if (k.startsWith(prefixo)) S.val.delete(k)
  for (const k of [...S.voo.keys()]) if (k.startsWith(prefixo)) S.voo.delete(k)
}
