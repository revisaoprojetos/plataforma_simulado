/**
 * Helpers de acesso a JSON por "dot-path" para o mapeamento dinâmico de webhooks.
 * Suporta `a.b.c`, índices `a.items[0].id` e `a.items.0.id`. Tipos-only (sem server-only)
 * para uso em client e server.
 */

/** Lê um valor por caminho (dot/colchete). Retorna undefined se qualquer parte faltar. */
export function getByPath(obj: unknown, path?: string | null): unknown {
  if (obj == null || !path) return undefined
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean)
  let cur: any = obj
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

/** Lê como string (ou null). */
export function getStr(obj: unknown, path?: string | null): string | null {
  const v = getByPath(obj, path)
  return v == null || typeof v === 'object' ? null : String(v)
}

/**
 * Achata um objeto em pares { path, sample } com os caminhos FOLHA (para o seletor do mapa).
 * Em arrays, entra só no 1º elemento (representativo). Trunca o sample.
 */
export function flattenPaths(obj: unknown, max = 200): { path: string; sample: string }[] {
  const out: { path: string; sample: string }[] = []
  const walk = (o: any, pre: string) => {
    if (out.length >= max || o == null) return
    if (Array.isArray(o)) { if (o.length) walk(o[0], `${pre}[0]`); return }
    if (typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) {
        const p = pre ? `${pre}.${k}` : k
        if (v != null && typeof v === 'object') walk(v, p)
        else out.push({ path: p, sample: v == null ? '' : String(v).slice(0, 60) })
        if (out.length >= max) return
      }
      return
    }
  }
  walk(obj, '')
  return out
}
