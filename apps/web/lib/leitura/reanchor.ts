import 'server-only'
import { parse, NodeType } from 'node-html-parser'

// Re-âncora de anotação entre versões (server, sem DOM). Reconstrói a "espinha" de
// texto do HTML da NOVA versão (mesma regra do cliente: concatena text nodes,
// ignora questões injetadas) e reposiciona a âncora pelo text-quote {exact,prefix,
// suffix}. Usado na publicação (carry-over) — casa com lib/leitura/anotacoes-engine.

export interface AncoraTxt { inicio: number; fim: number; exact: string; prefix: string; suffix: string }

/** Espinha (concatenação do texto) de um HTML — ignora [data-leitura-q]/[data-disp-q]. */
export function espinhaDeHtml(html: string): string {
  const root = parse(html ?? '')
  let S = ''
  const walk = (node: any, dentroQuestao: boolean) => {
    if (node.nodeType === NodeType.TEXT_NODE) { if (!dentroQuestao) S += node.text ?? ''; return }
    if (node.nodeType !== NodeType.ELEMENT_NODE) return
    const q = dentroQuestao || (typeof node.getAttribute === 'function' && node.getAttribute('data-leitura-q') != null)
    for (const c of node.childNodes) walk(c, q)
  }
  for (const c of root.childNodes) walk(c, false)
  return S
}

/** Reposiciona a âncora na nova espinha. null se não achar o trecho. */
export function reancorar(S: string, a: AncoraTxt): { inicio: number; fim: number } | null {
  if (!a.exact) return null
  // 1) posição esperada ainda casa?
  if (S.slice(a.inicio, a.fim) === a.exact) return { inicio: a.inicio, fim: a.fim }
  // 2) busca todas as ocorrências e desempata por contexto + proximidade.
  const idxs: number[] = []
  let i = S.indexOf(a.exact)
  while (i >= 0 && idxs.length < 200) { idxs.push(i); i = S.indexOf(a.exact, i + 1) }
  if (!idxs.length) return null
  let best = idxs[0], bestScore = -Infinity
  for (const idx of idxs) {
    const pre = S.slice(Math.max(0, idx - (a.prefix?.length ?? 0)), idx)
    const suf = S.slice(idx + a.exact.length, idx + a.exact.length + (a.suffix?.length ?? 0))
    let score = 0
    if (a.prefix && pre.endsWith(a.prefix.slice(-8))) score += 2
    if (a.suffix && suf.startsWith(a.suffix.slice(0, 8))) score += 2
    score -= Math.abs(idx - a.inicio) / 1000
    if (score > bestScore) { bestScore = score; best = idx }
  }
  return { inicio: best, fim: best + a.exact.length }
}
