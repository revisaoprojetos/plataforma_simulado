// TÓPICOS / "Temas do dia": derivados dos TÍTULOS (h1/h2/h3) do conteúdo (híbrido). A base (nome +
// âncora) é automática; o admin complementa por tópico: tags (selos), nº de questões e incluir/ocultar.
// A config fica em quiz_config.topicos, chaveada pelo SLUG do texto do título (estável a reordenações).

import { slugDeTag } from './selos'

/** Tópico extraído do HTML (nome do título + nível + chave estável). */
export interface TopicoBase { key: string; nome: string; nivel: number }
/** Ajuste do admin por tópico (chaveado por key). */
export interface TopicoConfig { tags: string[]; questoes: number; incluido: boolean }
export type TopicosConfig = Record<string, TopicoConfig>

/** Slug estável a partir do texto do título (sem acento, minúsculo, hífens). */
export function slugTopico(txt: string): string {
  return (txt || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'tema'
}

/** Config default de um tópico. */
export const TOPICO_DEFAULT: TopicoConfig = { tags: [], questoes: 0, incluido: true }

/** Higieniza a config crua (quiz_config.topicos) → TopicosConfig. */
export function resolverTopicos(raw: unknown): TopicosConfig {
  const out: TopicosConfig = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!v || typeof v !== 'object') continue
    const o = v as Record<string, unknown>
    const tags = Array.isArray(o.tags) ? (o.tags as unknown[]).map((t) => slugDeTag(String(t))).filter(Boolean) as string[] : []
    const questoes = typeof o.questoes === 'number' && o.questoes >= 0 ? Math.round(o.questoes) : 0
    const incluido = o.incluido !== false
    out[k] = { tags: Array.from(new Set(tags)), questoes, incluido }
  }
  return out
}

const NIVEL = { H1: 1, H2: 2, H3: 3, H4: 3, H5: 3, H6: 3 } as Record<string, number>

/** É um TÍTULO/tópico? h1-h6 sempre; parágrafo/div curto que seja negrito, centralizado OU CAIXA ALTA. */
function ehTitulo(el: Element): boolean {
  const tag = el.tagName
  if (/^H[1-6]$/.test(tag)) return true
  if (tag !== 'P' && tag !== 'DIV') return false
  if ((el as HTMLElement).closest?.('table, .caixa-colapsavel, li')) return false
  // Só blocos "folha" (sem outro bloco dentro) — evita wrappers.
  if (el.querySelector('p, div, table, ul, ol, h1, h2, h3, h4, h5, h6')) return false
  const txt = (el.textContent || '').replace(/\s+/g, ' ').trim()
  if (!txt || txt.length > 120) return false
  const style = (el.getAttribute('style') || '').toLowerCase()
  const centrado = /text-align\s*:\s*center/.test(style) || el.getAttribute('align') === 'center' || el.getAttribute('data-align') === 'center'
  const negritoEstilo = /font-weight\s*:\s*(bold|[6-9]00)/.test(style)
  const negrito = (() => {
    const bs = el.querySelectorAll('b, strong')
    if (!bs.length) return false
    const boldLen = Array.from(bs).reduce((s, b) => s + (b.textContent || '').replace(/\s+/g, ' ').trim().length, 0)
    return boldLen >= txt.length * 0.85 // quase todo o texto é negrito
  })()
  const caixaAlta = txt.length >= 6 && /[A-ZÀ-Þ]/.test(txt) && txt === txt.toUpperCase()
  return centrado || negritoEstilo || negrito || caixaAlta
}

/** Coleta os títulos do root (em ordem) com chave estável (slug + sufixo p/ repetidos). */
function coletarTitulos(root: ParentNode): { el: Element; key: string; nome: string; nivel: number }[] {
  let els: Element[]
  try { els = Array.from(root.querySelectorAll('h1, h2, h3, h4, h5, h6, p, div')) } catch { return [] }
  const vistos = new Map<string, number>()
  const out: { el: Element; key: string; nome: string; nivel: number }[] = []
  for (const el of els) {
    if (!ehTitulo(el)) continue
    const nome = (el.textContent || '').replace(/\s+/g, ' ').trim()
    if (!nome) continue
    let key = slugTopico(nome)
    const n = (vistos.get(key) ?? 0) + 1
    vistos.set(key, n)
    if (n > 1) key = `${key}-${n}`
    out.push({ el, key, nome, nivel: NIVEL[el.tagName] ?? 2 })
  }
  return out
}

/** Extrai os tópicos (títulos) do container/DOM. NÃO usa globals — recebe o root por parâmetro. */
export function extrairTopicos(root: ParentNode | null | undefined): TopicoBase[] {
  if (!root) return []
  return coletarTitulos(root).map(({ key, nome, nivel }) => ({ key, nome, nivel }))
}

/** Marca os títulos com `data-tema` (âncora) + classe `leitura-titulo` (p/ preservar o tamanho/estilo
 * no leitor, que senão anula o font-size inline). Mesma detecção do extrair. */
export function ancorarTopicos(root: ParentNode | null | undefined): void {
  if (!root) return
  for (const { el, key } of coletarTitulos(root)) {
    el.setAttribute('data-tema', key)
    el.classList.add('leitura-titulo')
  }
}
