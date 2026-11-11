// DIFF PURO entre duas páginas (V1). Sem server-only: usado no servidor e no cliente (diálogo de publicação).
// Por bloco (identificado por id): adicionado / removido / alterado (campos) / reordenado (mudou de posição relativa).
import { CATALOGO } from './catalogo'
import type { BlocoAny, PaginaV1 } from './tipos'

export type StatusDiff = 'adicionado' | 'removido' | 'alterado' | 'reordenado' | 'igual'
export interface DiffItem {
  id: string
  tipo: BlocoAny['tipo']
  rotulo: string
  status: StatusDiff
  /** Mudou de posição relativa (pode coexistir com `alterado`). */
  reordenado: boolean
  /** Rótulos legíveis dos campos que mudaram (só para alterado). */
  campos: string[]
}
export interface DiffPagina {
  itens: DiffItem[]
  contagem: { adicionado: number; removido: number; alterado: number; reordenado: number }
  temaAlterado: boolean
  /** true = nenhuma diferença (nem tema). */
  igual: boolean
}

const estavel = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(estavel).join(',')}]`
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>
    return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${estavel(o[k])}`).join(',')}}`
  }
  return JSON.stringify(v) ?? 'null'
}

const rotuloBloco = (b: BlocoAny) => (b.nome?.trim() || CATALOGO[b.tipo]?.rotulo || b.tipo)

const PLANO: Record<string, string> = { nome: 'Título', variacao: 'Variação', ativo: 'Ativo', ancora: 'Âncora' }
function rotuloCampo(tipo: BlocoAny['tipo'], chave: string): string {
  if (PLANO[chave]) return PLANO[chave]
  const def = CATALOGO[tipo]?.schema.find((c) => c.chave === chave)
  if (def) return def.rotulo
  if (chave === 'visib') return 'Visibilidade por dispositivo'
  if (chave.startsWith('conteudo.')) return chave.slice(9).replace(/_/g, ' ')
  if (chave.startsWith('estilo.')) return `Estilo: ${chave.slice(7)}`
  return chave
}

function camposAlterados(a: BlocoAny, b: BlocoAny): string[] {
  const out: string[] = []
  const chaves: [string, unknown, unknown][] = [
    ['nome', a.nome ?? '', b.nome ?? ''], ['variacao', a.variacao, b.variacao], ['ativo', a.ativo, b.ativo], ['ancora', a.ancora ?? '', b.ancora ?? ''],
    ['visib', a.visib, b.visib],
  ]
  for (const [k, x, y] of chaves) if (estavel(x) !== estavel(y)) out.push(rotuloCampo(b.tipo, k))
  const ca = a.conteudo as unknown as Record<string, unknown>, cb = b.conteudo as unknown as Record<string, unknown>
  for (const k of new Set([...Object.keys(ca), ...Object.keys(cb)])) if (estavel(ca[k]) !== estavel(cb[k])) out.push(rotuloCampo(b.tipo, `conteudo.${k}`))
  const ea = a.estilo as Record<string, unknown>, eb = b.estilo as Record<string, unknown>
  for (const k of new Set([...Object.keys(ea), ...Object.keys(eb)])) if (estavel(ea[k]) !== estavel(eb[k])) out.push(rotuloCampo(b.tipo, `estilo.${k}`))
  return [...new Set(out)]
}

/** Índices (de `seq`) que NÃO pertencem à maior subsequência crescente = itens “movidos”. */
function movidos(seq: number[]): Set<number> {
  const n = seq.length; if (n < 2) return new Set()
  const tails: number[] = [], prev = new Array<number>(n).fill(-1)
  for (let i = 0; i < n; i++) {
    let lo = 0, hi = tails.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (seq[tails[m]] < seq[i]) lo = m + 1; else hi = m }
    if (lo > 0) prev[i] = tails[lo - 1]
    tails[lo] = i
  }
  const fica = new Set<number>(); let k = tails[tails.length - 1]
  while (k !== undefined && k >= 0) { fica.add(k); k = prev[k] }
  const mv = new Set<number>(); for (let i = 0; i < n; i++) if (!fica.has(i)) mv.add(i)
  return mv
}

/** Compara `a` (base, ex.: publicado) com `b` (novo, ex.: rascunho). Itens na ordem de `b`, removidos ao final. */
export function diffPaginas(a: PaginaV1 | null | undefined, b: PaginaV1 | null | undefined): DiffPagina {
  const A = a?.blocos ?? [], B = b?.blocos ?? []
  const mapaA = new Map(A.map((x, i) => [x.id, { x, i }]))
  const idsB = new Set(B.map((x) => x.id))
  // ordem relativa dos blocos comuns: posição em A, na sequência de B
  const comunsB = B.filter((x) => mapaA.has(x.id))
  const mv = movidos(comunsB.map((x) => {
    const pos = mapaA.get(x.id)!.i
    return A.filter((y, j) => j < pos && idsB.has(y.id)).length // posição entre os comuns em A
  }))
  const idsMovidos = new Set([...mv].map((i) => comunsB[i].id))

  const itens: DiffItem[] = []
  for (const x of B) {
    const o = mapaA.get(x.id)
    if (!o) { itens.push({ id: x.id, tipo: x.tipo, rotulo: rotuloBloco(x), status: 'adicionado', reordenado: false, campos: [] }); continue }
    const campos = estavel(o.x) === estavel(x) ? [] : camposAlterados(o.x, x)
    const reordenado = idsMovidos.has(x.id)
    itens.push({ id: x.id, tipo: x.tipo, rotulo: rotuloBloco(x), status: campos.length ? 'alterado' : reordenado ? 'reordenado' : 'igual', reordenado, campos })
  }
  for (const x of A) if (!idsB.has(x.id)) itens.push({ id: x.id, tipo: x.tipo, rotulo: rotuloBloco(x), status: 'removido', reordenado: false, campos: [] })

  const contagem = {
    adicionado: itens.filter((i) => i.status === 'adicionado').length,
    removido: itens.filter((i) => i.status === 'removido').length,
    alterado: itens.filter((i) => i.status === 'alterado').length,
    reordenado: itens.filter((i) => i.reordenado).length,
  }
  const temaAlterado = estavel(a?.tema ?? {}) !== estavel(b?.tema ?? {})
  return { itens, contagem, temaAlterado, igual: !temaAlterado && itens.every((i) => i.status === 'igual') }
}

export interface BlocoVazio { id: string; rotulo: string; motivo: string }

/** Blocos ATIVOS que renderizariam vazio/sem utilidade no aluno (alerta antes de publicar). */
export function blocosVazios(p: PaginaV1 | null | undefined): BlocoVazio[] {
  const out: BlocoVazio[] = []
  for (const b of p?.blocos ?? []) {
    if (!b.ativo) continue
    const r = rotuloBloco(b); let motivo = ''
    switch (b.tipo) {
      case 'banner': if (!b.conteudo.imagem) motivo = 'sem imagem'; break
      case 'carrossel': if (!b.conteudo.itens.length) motivo = 'sem itens'; break
      case 'modulos': if (!b.conteudo.modulo_ids.length && !b.conteudo.restantes) motivo = 'sem módulos selecionados'; break
      case 'texto': if (!b.conteudo.titulo.trim() && !b.conteudo.html.replace(/<[^>]*>/g, '').trim()) motivo = 'sem texto'; break
      case 'botao': if (!b.conteudo.rotulo.trim() || !b.conteudo.link.trim()) motivo = !b.conteudo.rotulo.trim() ? 'sem rótulo' : 'sem link'; break
    }
    if (!b.visib.desktop && !b.visib.tablet && !b.visib.mobile) motivo = 'oculto em todos os dispositivos'
    if (motivo) out.push({ id: b.id, rotulo: r, motivo })
  }
  return out
}
