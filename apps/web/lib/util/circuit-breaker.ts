/**
 * Circuit breaker simples (por processo). Falhou `limite` vezes seguidas → ABRE por `pausaMs`
 * (as chamadas são puladas: o chamador usa cache/estado de erro). Passado o tempo, deixa UMA
 * tentativa passar (meia-abertura); se der certo fecha, se falhar reabre.
 * Serve para gravações best-effort e leituras que podem falhar repetidamente (tabela/coluna
 * ausente, banco saturado) sem martelar o Postgres a cada request.
 */
export interface CircuitBreaker {
  /** true = pode tentar agora. */
  permitir(): boolean
  sucesso(): void
  falha(): void
  aberto(): boolean
  /** Executa `fn` sob o breaker; aberto → devolve `fallback` sem chamar. Lançar = falha. */
  executar<T>(fn: () => Promise<T>, fallback: T): Promise<T>
}

export function criarCircuitBreaker(opts: { limite?: number; pausaMs?: number; agora?: () => number } = {}): CircuitBreaker {
  const limite = opts.limite ?? 5
  const pausaMs = opts.pausaMs ?? 60_000
  const agora = opts.agora ?? Date.now
  let falhas = 0
  let abertoAte = 0
  let sondando = false

  const permitir = () => {
    if (abertoAte === 0) return true
    if (agora() < abertoAte) return false
    if (sondando) return false // só uma sonda por vez
    sondando = true
    return true
  }
  const sucesso = () => { falhas = 0; abertoAte = 0; sondando = false }
  const falha = () => {
    sondando = false
    falhas++
    if (falhas >= limite) abertoAte = agora() + pausaMs
  }
  const aberto = () => abertoAte !== 0 && agora() < abertoAte
  const executar = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    if (!permitir()) return fallback
    try { const v = await fn(); sucesso(); return v } catch (e) { falha(); void e; return fallback }
  }
  return { permitir, sucesso, falha, aberto, executar }
}
