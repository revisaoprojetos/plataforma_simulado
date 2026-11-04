/**
 * CAPA + PÁGINA INICIAL da Biblioteca — resolução com herança pelas pastas. PURO (client-safe).
 *
 * Regras (as mesmas para capa e para página inicial):
 *  1. O valor do PRÓPRIO documento vence.
 *  2. Senão, sobe pela árvore (pasta do documento → pai → avô…) e usa a 1ª pasta que tenha o valor E esteja em modo 'lote'.
 *     Pasta em modo 'individual' NÃO propaga (o valor dela só aparece no card da própria pasta) — a busca segue subindo.
 *  3. Senão: sem capa customizada (admin cai na miniatura automática, aluno no ícone) / página 1.
 */

export type ModoCP = 'lote' | 'individual'

export interface PastaCP {
  id: string
  pai_id: string | null
  nome?: string
  capa_url?: string | null
  capa_modo?: string | null
  pagina_inicial?: number | null
  pagina_inicial_modo?: string | null
}

export interface Resolvido<T> {
  valor: T | null
  origem: 'documento' | 'pasta' | null
  /** pasta de onde veio (quando origem = 'pasta') — p/ o admin dizer "herdada de …". */
  pastaId?: string
  pastaNome?: string
}

const modoDe = (m: unknown): ModoCP => (m === 'individual' ? 'individual' : 'lote')
const urlValida = (u: unknown): u is string => typeof u === 'string' && u.trim().length > 0
export const paginaValida = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 1

/** Mapa id → pasta (de uma lista). */
export function mapaPastas<T extends PastaCP>(pastas: T[]): Map<string, T> {
  return new Map(pastas.map((p) => [p.id, p]))
}

function subir<T>(
  pastaId: string | null | undefined,
  porId: Map<string, PastaCP>,
  pega: (p: PastaCP) => { v: T | null; modo: ModoCP },
): Resolvido<T> {
  const seen = new Set<string>()
  let cur = pastaId ?? null
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const p = porId.get(cur)
    if (!p) break
    const { v, modo } = pega(p)
    if (v != null && modo === 'lote') return { valor: v, origem: 'pasta', pastaId: p.id, pastaNome: p.nome }
    cur = p.pai_id ?? null
  }
  return { valor: null, origem: null }
}

/** Capa EFETIVA de um documento (customizada). `null` = nenhuma customizada. */
export function resolverCapaDoc(docCapa: string | null | undefined, pastaId: string | null | undefined, porId: Map<string, PastaCP>): Resolvido<string> {
  if (urlValida(docCapa)) return { valor: docCapa.trim(), origem: 'documento' }
  return subir<string>(pastaId, porId, (p) => ({ v: urlValida(p.capa_url) ? p.capa_url.trim() : null, modo: modoDe(p.capa_modo) }))
}

/** Página inicial EFETIVA de um documento (≥ 1). `valor: null` = começa na 1. */
export function resolverPaginaInicialDoc(docPagina: number | null | undefined, pastaId: string | null | undefined, porId: Map<string, PastaCP>): Resolvido<number> {
  if (paginaValida(docPagina)) return { valor: Math.trunc(docPagina), origem: 'documento' }
  return subir<number>(pastaId, porId, (p) => ({ v: paginaValida(p.pagina_inicial) ? Math.trunc(p.pagina_inicial) : null, modo: modoDe(p.pagina_inicial_modo) }))
}

/** Normaliza o que vem de formulário: página ≥ 1 inteira ou null. */
export function normalizarPagina(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v.trim()) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n >= 1 ? Math.min(100000, Math.trunc(n)) : null
}
export const normalizarModo = (v: unknown): ModoCP => modoDe(v)
