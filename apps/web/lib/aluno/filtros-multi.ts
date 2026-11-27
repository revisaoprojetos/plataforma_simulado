// Filtros do Banco de Questões com MULTI-SELEÇÃO: cada filtro vira uma lista na URL separada por "|"
// (ex.: ?banca=<id1>|<id2>). Um valor único continua válido (links antigos). Funções puras, usadas no
// servidor (page) e no cliente (sidebar).

export const SEP = '|'

/** "a|b|c" → ['a','b','c'] (sem vazios, sem repetidos). */
export function lerLista(v?: string | null): string[] {
  if (!v) return []
  return [...new Set(String(v).split(SEP).map((s) => s.trim()).filter(Boolean))]
}

/** ['a','b'] → "a|b" (vazio → undefined, p/ sumir da URL). */
export function juntarLista(l: string[]): string | undefined {
  const u = [...new Set(l.filter(Boolean))]
  return u.length ? u.join(SEP) : undefined
}

export function alternarItem(atual: string | undefined, item: string): string | undefined {
  const l = lerLista(atual)
  return juntarLista(l.includes(item) ? l.filter((x) => x !== item) : [...l, item])
}

export interface NoAssunto { id: string; pai_id: string | null }

/** Ids selecionados + TODOS os descendentes (sub-assuntos por pai_id) — escolher um assunto abrange os filhos. */
export function expandirAssuntos(selecionados: string[], todos: NoAssunto[]): string[] {
  if (!selecionados.length) return []
  const filhos = new Map<string, string[]>()
  for (const a of todos) if (a.pai_id) filhos.set(a.pai_id, [...(filhos.get(a.pai_id) ?? []), a.id])
  const out = new Set<string>()
  const pilha = [...selecionados]
  while (pilha.length) {
    const id = pilha.pop()!
    if (out.has(id)) continue
    out.add(id)
    for (const f of filhos.get(id) ?? []) pilha.push(f)
  }
  return [...out]
}
