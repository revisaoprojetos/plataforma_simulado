// Cliente das rotas GET de "Disciplinas e metas": fetch com timeout + AbortController e erro SEMPRE resolvido
// (nunca fica pendurado). `abortado` = o chamador cancelou (ignorar o resultado, não mostrar erro).

export type ResultadoFetch<T> = { ok: true; data: T } | { ok: false; error: string; abortado?: boolean }

export async function buscarJson<T>(
  url: string, opts: { signal?: AbortSignal; timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<ResultadoFetch<T>> {
  const ms = opts.timeoutMs ?? 20_000
  const ctl = new AbortController()
  let estourou = false
  const onAbort = () => ctl.abort()
  if (opts.signal) { if (opts.signal.aborted) return { ok: false, error: 'Cancelado.', abortado: true }; opts.signal.addEventListener('abort', onAbort, { once: true }) }
  const t = setTimeout(() => { estourou = true; ctl.abort() }, ms)
  try {
    const res = await (opts.fetchImpl ?? fetch)(url, { credentials: 'same-origin', signal: ctl.signal, cache: 'no-store' })
    let corpo: unknown = null
    try { corpo = await res.json() } catch { /* corpo não-JSON */ }
    const c = (corpo ?? {}) as { ok?: boolean; error?: string; message?: string }
    if (!res.ok || c.ok === false) return { ok: false, error: c.error || c.message || `Erro ${res.status} ao carregar.` }
    return { ok: true, data: corpo as T }
  } catch (e) {
    if (estourou) return { ok: false, error: `A consulta demorou mais de ${Math.round(ms / 1000)} s. Tente de novo.` }
    if (opts.signal?.aborted || (e as Error)?.name === 'AbortError') return { ok: false, error: 'Cancelado.', abortado: true }
    return { ok: false, error: 'Sem conexão com o servidor. Tente de novo.' }
  } finally {
    clearTimeout(t)
    opts.signal?.removeEventListener('abort', onAbort)
  }
}
