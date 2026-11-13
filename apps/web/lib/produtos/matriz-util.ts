// Utilitários PUROS da matriz de regras (client-safe, testáveis): nome curto do público, chaves de célula e resolução da seleção
// (células / linhas / colunas) em PARES (público -> alvos) para as ações em lote.
import type { PublicoCol } from './mapa-regras-tipos'

export const LIMITE_ALVOS = 500
export const LIMITE_PUBLICOS = 60
export const LIMITE_PARES = 5000

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'a', 'o', 'em', 'para', 'com'])
function titulo(s: string): string {
  const todasMaiusc = s === s.toUpperCase() && /[A-ZÀ-Ý]/.test(s)
  if (!todasMaiusc) return s
  return s.toLowerCase().split(' ').map((w, i) => (i > 0 && MINUSCULAS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1))).join(' ')
}

/** Nome CURTO para o cabeçalho: "ASSINATURA PASSAPORTE + 1 ANO | TURMA MAIO 2026" -> "Turma Maio 2026"; corta em `max` com reticências. */
export function nomeCurtoPublico(nome: string, max = 18): string {
  const partes = String(nome ?? '').split('|').map((p) => p.trim()).filter(Boolean)
  let base = partes.length > 1 ? partes[partes.length - 1] : (partes[0] ?? '')
  base = base.replace(/\s+/g, ' ').replace(/^(grupo|segmento)\s*:\s*/i, '')
  base = titulo(base)
  return base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base
}

/** Nomes curtos únicos para a lista (colisão -> acrescenta o início do nome longo / contador). */
export function nomesCurtos(publicos: PublicoCol[], max = 18): Record<string, string> {
  const out: Record<string, string> = {}
  const usados = new Map<string, number>()
  for (const p of publicos) {
    let n = p.tipo === 'todos' ? 'Todos' : nomeCurtoPublico(p.nome, max)
    const k = n.toLowerCase()
    const c = (usados.get(k) ?? 0) + 1
    usados.set(k, c)
    if (c > 1) {
      const inicio = nomeCurtoPublico(String(p.nome).split('|')[0], 8)
      n = `${n.slice(0, Math.max(4, max - 6))}… ${inicio}`.slice(0, max + 4)
      if (c > 2) n = `${n} ${c}`
    }
    out[p.chave] = n
  }
  return out
}

export const chaveCelula = (alvoId: string, publico: string) => `${alvoId}|${publico}`
export function lerChaveCelula(k: string): { alvoId: string; publico: string } { const i = k.indexOf('|'); return { alvoId: k.slice(0, i), publico: k.slice(i + 1) } }

export interface SelecaoMatriz { celulas: Set<string>; linhas: Set<string>; colunas: Set<string> }
export const selecaoVazia = (): SelecaoMatriz => ({ celulas: new Set(), linhas: new Set(), colunas: new Set() })
export const selecaoTotal = (s: SelecaoMatriz) => s.celulas.size + s.linhas.size + s.colunas.size

/** Resolve a seleção em pares (público -> alvos, sem repetição). linhas × colunasVisiveis ∪ todosAlvos × colunasSel ∪ células. */
export function resolverPares(s: SelecaoMatriz, colunasVisiveis: string[], todosAlvos: string[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>()
  const add = (pub: string, alvo: string) => { let st = m.get(pub); if (!st) { st = new Set(); m.set(pub, st) } st.add(alvo) }
  for (const a of s.linhas) for (const c of colunasVisiveis) add(c, a)
  for (const c of s.colunas) for (const a of todosAlvos) add(c, a)
  for (const k of s.celulas) { const { alvoId, publico } = lerChaveCelula(k); add(publico, alvoId) }
  return m
}

export interface ResumoPares { alvos: number; publicos: number; pares: number; erro: string | null }
export function resumirPares(m: Map<string, Set<string>>): ResumoPares {
  const alvos = new Set<string>(); let pares = 0
  for (const st of m.values()) { pares += st.size; st.forEach((a) => alvos.add(a)) }
  const erro = alvos.size > LIMITE_ALVOS ? `Seleção grande demais: ${alvos.size} módulos/aulas (máx. ${LIMITE_ALVOS} por vez).`
    : m.size > LIMITE_PUBLICOS ? `Públicos demais (${m.size}; máx. ${LIMITE_PUBLICOS}).`
    : pares > LIMITE_PARES ? `Células demais (${pares}; máx. ${LIMITE_PARES}).` : null
  return { alvos: alvos.size, publicos: m.size, pares, erro }
}

/** Células do retângulo entre duas posições (índices de linha/coluna visíveis). */
export function retangulo(linhas: string[], colunas: string[], a: { l: number; c: number }, b: { l: number; c: number }): string[] {
  const l0 = Math.min(a.l, b.l), l1 = Math.max(a.l, b.l), c0 = Math.min(a.c, b.c), c1 = Math.max(a.c, b.c)
  const out: string[] = []
  for (let l = l0; l <= l1; l++) for (let c = c0; c <= c1; c++) if (linhas[l] && colunas[c]) out.push(chaveCelula(linhas[l], colunas[c]))
  return out
}
