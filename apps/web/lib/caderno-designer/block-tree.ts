// Operações recursivas na árvore de blocos (suportam aninhamento: card, colunas/coluna).
// Todas retornam novas arrays (imutável) e descem em innerBlocks.

import { type Block, genId } from './types'

/** Clona um bloco com novos ids (recursivo nos filhos) — usado ao duplicar. */
function cloneComIds(b: Block): Block {
  return {
    ...b,
    id: genId(b.type),
    attributes: { ...b.attributes },
    innerBlocks: b.innerBlocks ? b.innerBlocks.map(cloneComIds) : undefined,
  }
}

/** Duplica o bloco (e seus filhos) logo após o original. */
export function duplicateBlock(blocks: Block[], id: string): Block[] {
  const orig = findBlock(blocks, id)
  if (!orig) return blocks
  return insertAfter(blocks, id, cloneComIds(orig))
}

export function findBlock(blocks: Block[], id: string): Block | null {
  for (const b of blocks) {
    if (b.id === id) return b
    if (b.innerBlocks) { const f = findBlock(b.innerBlocks, id); if (f) return f }
  }
  return null
}

export function updateAttrs(blocks: Block[], id: string, patch: Record<string, unknown>): Block[] {
  return blocks.map((b) => {
    if (b.id === id) return { ...b, attributes: { ...b.attributes, ...patch } }
    if (b.innerBlocks) return { ...b, innerBlocks: updateAttrs(b.innerBlocks, id, patch) }
    return b
  })
}

export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks.filter((b) => b.id !== id).map((b) => (b.innerBlocks ? { ...b, innerBlocks: removeBlock(b.innerBlocks, id) } : b))
}

/** Move um bloco entre seus irmãos (±1), em qualquer nível. */
export function moveBlock(blocks: Block[], id: string, dir: -1 | 1): Block[] {
  const i = blocks.findIndex((b) => b.id === id)
  if (i !== -1) {
    const j = i + dir
    if (j < 0 || j >= blocks.length) return blocks
    const cp = [...blocks]
    ;[cp[i], cp[j]] = [cp[j], cp[i]]
    return cp
  }
  return blocks.map((b) => (b.innerBlocks ? { ...b, innerBlocks: moveBlock(b.innerBlocks, id, dir) } : b))
}

/** Insere `novo` logo depois de `targetId` (mesmo nível), em qualquer profundidade. */
export function insertAfter(blocks: Block[], targetId: string, novo: Block): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    if (b.id === targetId) { out.push(b); out.push(novo) }
    else if (b.innerBlocks) out.push({ ...b, innerBlocks: insertAfter(b.innerBlocks, targetId, novo) })
    else out.push(b)
  }
  return out
}

/** Insere `novo` logo antes de `targetId` (mesmo nível), em qualquer profundidade. */
export function insertBefore(blocks: Block[], targetId: string, novo: Block): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    if (b.id === targetId) { out.push(novo); out.push(b) }
    else if (b.innerBlocks) out.push({ ...b, innerBlocks: insertBefore(b.innerBlocks, targetId, novo) })
    else out.push(b)
  }
  return out
}

/** Remove e retorna o bloco `id` (para mover). */
export function extractBlock(blocks: Block[], id: string): { blocks: Block[]; found: Block | null } {
  let found: Block | null = null
  const walk = (bs: Block[]): Block[] => {
    const out: Block[] = []
    for (const b of bs) {
      if (b.id === id) { found = b; continue }
      out.push(b.innerBlocks ? { ...b, innerBlocks: walk(b.innerBlocks) } : b)
    }
    return out
  }
  const res = walk(blocks)
  return { blocks: res, found }
}

/** Insere `novo` no fim dos filhos do container `containerId`. */
export function insertInto(blocks: Block[], containerId: string, novo: Block): Block[] {
  return blocks.map((b) => {
    if (b.id === containerId) return { ...b, innerBlocks: [...(b.innerBlocks ?? []), novo] }
    if (b.innerBlocks) return { ...b, innerBlocks: insertInto(b.innerBlocks, containerId, novo) }
    return b
  })
}

function criarColuna(filhos: Block[] = []): Block {
  return { id: genId('coluna'), type: 'coluna', attributes: {}, innerBlocks: filhos }
}

/** Envolve `targetId` numa linha de colunas, criando uma coluna vazia ao lado (lado a lado). */
export function wrapAoLado(blocks: Block[], targetId: string, gap = 16): Block[] {
  return blocks.map((b) => {
    if (b.id === targetId && b.type !== 'colunas') {
      return { id: genId('colunas'), type: 'colunas', attributes: { gap }, innerBlocks: [criarColuna([b]), criarColuna([])] }
    }
    if (b.innerBlocks) return { ...b, innerBlocks: wrapAoLado(b.innerBlocks, targetId, gap) }
    return b
  })
}

/** Envolve `targetId` em colunas colocando `novo` ao lado (esquerda/direita). */
export function wrapLado(blocks: Block[], targetId: string, novo: Block, lado: 'left' | 'right', gap = 16): Block[] {
  return blocks.map((b) => {
    if (b.id === targetId) {
      const colAlvo = criarColuna([b])
      const colNovo = criarColuna([novo])
      const inner = lado === 'left' ? [colNovo, colAlvo] : [colAlvo, colNovo]
      return { id: genId('colunas'), type: 'colunas', attributes: { gap }, innerBlocks: inner }
    }
    if (b.innerBlocks) return { ...b, innerBlocks: wrapLado(b.innerBlocks, targetId, novo, lado, gap) }
    return b
  })
}

/** Ajusta o número de colunas de um bloco `colunas`. */
export function setNumColunas(blocks: Block[], colunasId: string, n: number): Block[] {
  return blocks.map((b) => {
    if (b.id === colunasId && b.type === 'colunas') {
      const atuais = b.innerBlocks ?? []
      if (n > atuais.length) return { ...b, innerBlocks: [...atuais, ...Array.from({ length: n - atuais.length }, () => criarColuna())] }
      return { ...b, innerBlocks: atuais.slice(0, Math.max(1, n)) }
    }
    if (b.innerBlocks) return { ...b, innerBlocks: setNumColunas(b.innerBlocks, colunasId, n) }
    return b
  })
}

/**
 * Limpa a árvore após remoções/movimentos: remove colunas vazias e desembrulha
 * `colunas` que ficaram com 1 coluna (o conteúdo volta a ocupar a linha inteira).
 * As colunas restantes (flex-1) se redistribuem sozinhas (2 → 50/50, 3 → 33…).
 */
export function limparArvore(blocks: Block[]): Block[] {
  const out: Block[] = []
  for (const b of blocks) {
    const nb: Block = b.innerBlocks ? { ...b, innerBlocks: limparArvore(b.innerBlocks) } : b
    if (nb.type === 'colunas') {
      const cols = (nb.innerBlocks ?? []).filter((c) => (c.innerBlocks?.length ?? 0) > 0)
      if (cols.length === 0) continue // remove a linha de colunas vazia
      if (cols.length === 1) { out.push(...(cols[0].innerBlocks ?? [])); continue } // desembrulha
      out.push({ ...nb, innerBlocks: cols })
      continue
    }
    out.push(nb)
  }
  return out
}

/** Coleta todos os tipos usados (para regra de bloco único). */
export function tiposNaArvore(blocks: Block[]): Set<string> {
  const set = new Set<string>()
  const walk = (bs: Block[]) => bs.forEach((b) => { set.add(b.type); if (b.innerBlocks) walk(b.innerBlocks) })
  walk(blocks)
  return set
}
