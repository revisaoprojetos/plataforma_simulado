// Caderno (beta) — OneNote fase 2: regras PURAS de subpáginas (nível), agrupamento/ordenação da árvore e "mover bloco".
// Sem imports de servidor (testável com vitest). Usado por notebook-server.ts e pelas rotas.
//
// MODELO: a hierarquia NÃO é uma árvore no banco; é a SEQUÊNCIA por `ordem` dentro da seção + `nivel` (0..2).
//   Uma página de nível n "possui" as páginas seguintes (contíguas) de nível > n  => "bloco".
//   Invariante: nivel[i] <= nivel[i-1] + 1  e  nivel[0] == 0  (normalizarNiveis garante).
import { LIMITES, type OrdenarPor } from '@/lib/aluno/notebook-tipos'

export interface PaginaOrdenavel {
  id: string
  titulo: string
  ordem: number
  nivel: number
  criado_em?: string | null
  atualizado_em?: string | null
}

const NIVEL_MAX = LIMITES.nivelMax

// ---------------------------------------------------------------- nível
/** Nível efetivo: 0..2 e nunca mais que (nível da página anterior + 1). Sem página anterior => 0. */
export function clampNivel(desejado: number, nivelAnterior: number | null | undefined): number {
  const d = Number.isFinite(desejado) ? Math.trunc(desejado) : 0
  const teto = typeof nivelAnterior === 'number' && Number.isFinite(nivelAnterior) ? Math.min(nivelAnterior + 1, NIVEL_MAX) : 0
  return Math.max(0, Math.min(d, teto))
}

/** Aplica o clamp em sequência (a 1ª vira 0; cada uma <= anterior+1). Devolve novo array. */
export function normalizarNiveis(niveis: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < niveis.length; i++) out.push(clampNivel(niveis[i], i === 0 ? null : out[i - 1]))
  return out
}

// ---------------------------------------------------------------- blocos / ordenação
/** Divide a sequência (na ordem manual) em blocos: cada nível 0 abre um bloco; subpáginas seguem o pai. Página órfã inicial abre bloco próprio. */
export function agruparBlocos<T extends { nivel: number }>(sequencia: T[]): T[][] {
  const blocos: T[][] = []
  for (const p of sequencia) {
    if (p.nivel <= 0 || blocos.length === 0) blocos.push([p])
    else blocos[blocos.length - 1].push(p)
  }
  return blocos
}

const ts = (v: string | null | undefined): number => { const t = v ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : 0 }
const cmpTitulo = (a: string, b: string) => (a ?? '').localeCompare(b ?? '', 'pt-BR', { sensitivity: 'base', numeric: true })

/**
 * Ordena a lista de páginas de UMA seção conforme `ordenar_por`, mantendo as subpáginas agrupadas sob a página-pai.
 * REGRA DE AGRUPAMENTO (documentada em docs/caderno-onenote-contrato.md):
 *  1. A entrada é primeiro colocada na ordem MANUAL (ordem, id) e dividida em blocos (pai nível 0 + filhos nível 1..2).
 *  2. Só os BLOCOS são reordenados; dentro do bloco os filhos mantêm a ordem manual. Nunca um filho sai de baixo do pai.
 *  3. Critérios (empate => ordem manual): 'manual' = ordem; 'criacao' = criado_em do PAI, mais antigo primeiro;
 *     'modificacao' = atualizado_em mais recente do BLOCO (pai ou qualquer filho), mais recente primeiro;
 *     'titulo' = título do PAI, A–Z (pt-BR, sem acento/caixa, números naturais).
 */
export function ordenarArvore<T extends PaginaOrdenavel>(paginas: T[], ordenarPor: OrdenarPor = 'manual'): T[] {
  const manual = [...paginas].sort((a, b) => (a.ordem - b.ordem) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  if (ordenarPor === 'manual') return manual
  const blocos = agruparBlocos(manual).map((b, i) => ({ b, i }))
  const chave = (x: { b: T[] }) => {
    const pai = x.b[0]
    switch (ordenarPor) {
      case 'criacao': return ts(pai.criado_em)
      case 'modificacao': return -Math.max(...x.b.map((p) => ts(p.atualizado_em)))
      default: return 0
    }
  }
  blocos.sort((x, y) => {
    const c = ordenarPor === 'titulo' ? cmpTitulo(x.b[0].titulo, y.b[0].titulo) : chave(x) - chave(y)
    return c || x.i - y.i
  })
  return blocos.flatMap((x) => x.b)
}

// ---------------------------------------------------------------- bloco (página + subpáginas contíguas)
/** Índices [ini, fim) do bloco da página em `idx` na sequência manual: ela + as seguintes de nível maior. */
export function intervaloBloco(niveis: number[], idx: number): [number, number] {
  let fim = idx + 1
  while (fim < niveis.length && niveis[fim] > niveis[idx]) fim++
  return [idx, fim]
}

/**
 * Reposiciona os níveis do bloco movido: a raiz recebe clamp pela página que ficará antes dela e os filhos
 * acompanham o mesmo delta (clamp 0..2 e sequencial).
 */
export function reajustarNiveisBloco(niveisBloco: number[], nivelAnteriorDestino: number | null | undefined): number[] {
  if (niveisBloco.length === 0) return []
  const raiz = clampNivel(niveisBloco[0], nivelAnteriorDestino)
  const delta = raiz - niveisBloco[0]
  const out = [raiz]
  for (let i = 1; i < niveisBloco.length; i++) out.push(clampNivel(Math.max(niveisBloco[i] + delta, raiz + 1), out[i - 1]))
  return out
}

// ---------------------------------------------------------------- mover
export interface PlanoMover {
  /** ids na sequência final do destino (inclui o bloco movido na posição certa). */
  sequenciaFinal: string[]
  /** ordem nova do item (id -> ordem). Contém TODOS os itens da sequência quando `renumerou`, senão só o bloco. */
  ordens: Map<string, number>
  renumerou: boolean
  /** nível novo de cada página do bloco (id -> nível). */
  niveisBloco: Map<string, number>
}

/**
 * Planeja mover `bloco` (ids, na ordem) para uma seção cuja sequência atual (SEM o bloco) é `destino`.
 * `antesDeId`: página do destino que ficará DEPOIS do bloco (null/undefined = fim). Id inexistente => null (erro do chamador).
 * Ordem por ponto médio entre vizinhos; se o espaço for insuficiente (< gapMinOrdem por item) renumera tudo em 1024*n.
 */
export function planejarMover(
  destino: { id: string; ordem: number; nivel: number }[],
  bloco: { id: string; nivel: number }[],
  antesDeId?: string | null,
): PlanoMover | null {
  if (bloco.length === 0) return null
  const base = destino.filter((d) => !bloco.some((b) => b.id === d.id))
  let pos = base.length
  if (antesDeId) {
    pos = base.findIndex((d) => d.id === antesDeId)
    if (pos < 0) return null
  }
  const prev = pos > 0 ? base[pos - 1] : null
  const next = pos < base.length ? base[pos] : null
  const niveis = reajustarNiveisBloco(bloco.map((b) => b.nivel), prev?.nivel ?? null)
  const niveisBloco = new Map(bloco.map((b, i) => [b.id, niveis[i]]))
  const sequenciaFinal = [...base.slice(0, pos).map((d) => d.id), ...bloco.map((b) => b.id), ...base.slice(pos).map((d) => d.id)]

  const n = bloco.length
  let ordens = new Map<string, number>()
  let renumerou = false
  const p = prev?.ordem, q = next?.ordem
  if (p === undefined && q === undefined) bloco.forEach((b, i) => ordens.set(b.id, LIMITES.passoOrdem * (i + 1)))
  else if (q === undefined) bloco.forEach((b, i) => ordens.set(b.id, (p as number) + LIMITES.passoOrdem * (i + 1)))
  else if (p === undefined) bloco.forEach((b, i) => ordens.set(b.id, q - LIMITES.passoOrdem * (n - i)))
  else {
    const passo = (q - p) / (n + 1)
    if (!(passo >= LIMITES.gapMinOrdem)) renumerou = true
    else bloco.forEach((b, i) => ordens.set(b.id, p + passo * (i + 1)))
  }
  if (renumerou) {
    ordens = new Map(sequenciaFinal.map((id, i) => [id, LIMITES.passoOrdem * (i + 1)]))
  }
  return { sequenciaFinal, ordens, renumerou, niveisBloco }
}
