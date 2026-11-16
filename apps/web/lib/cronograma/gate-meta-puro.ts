// Núcleo PURO (sem I/O) do gate de metas do Adaptativo — usado por gate-meta.ts e pelos testes (gate-meta-puro.test.ts).
export type BloqueioMeta = { motivo: 'ainda_nao_liberado' | 'sem_acesso'; liberaEm: string | null }

/** Algum doc da meta bloqueado pela matriz? `bl` = docId → 'AAAA-MM-DD' ('' = sem data). Devolve a data mais próxima. */
export function bloqueioPorMatriz(docs: string[], bl: Record<string, string>): BloqueioMeta | null {
  const bloq = docs.filter((d) => Object.prototype.hasOwnProperty.call(bl, d))
  if (!bloq.length) return null
  const datas = bloq.map((d) => bl[d]).filter(Boolean).sort()
  return { motivo: 'ainda_nao_liberado', liberaEm: datas[0] ?? null }
}

/** Item (d): aluno COM produto e NENHUM material da meta abre para ele → sem acesso. Meta sem documento / aluno sem produto → liberada. */
export function bloqueioSemAcesso(temProduto: boolean, nDocs: number, abre: boolean[]): BloqueioMeta | null {
  if (!temProduto || !nDocs) return null
  return abre.length && abre.every((x) => !x) ? { motivo: 'sem_acesso', liberaEm: null } : null
}
