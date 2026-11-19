// Diferença entre duas GRADES do plano ({ id: [AAAA-MM-DD, horas] }) — PURO (sem banco), usado no rastreio das reorganizações.
export type Grade = Record<string, [string, number]>

export interface ResumoGrade {
  movidas: number          // ids que existem nas duas grades com data diferente
  novas: number            // ids só na grade nova
  removidas: number        // ids só na grade antiga
  deslocamentoMedioDias: number   // média do |Δ dias| das movidas
  maiorDeslocamentoDias: number
}

/** Quantas movidas/novas/removidas bastam para guardar uma CÓPIA da grade anterior (reorganizar atrasadas, regerar, mover em massa). */
export const LIMIAR_SNAPSHOT_GRADE = 50
/** Quantas mudanças bastam para registrar o evento na auditoria (auto-save comum mexe em poucos ids). */
export const LIMIAR_AUDITORIA_GRADE = 10

const dias = (iso: string): number => { const [a, m, d] = iso.split('-').map(Number); return Date.UTC(a, (m || 1) - 1, d || 1) / 864e5 }

export function diffGrade(antes: Grade | null | undefined, depois: Grade | null | undefined): ResumoGrade {
  const a = antes ?? {}, d = depois ?? {}
  let movidas = 0, novas = 0, removidas = 0, soma = 0, maior = 0
  for (const id of Object.keys(d)) {
    const x = a[id]
    if (!x) { novas++; continue }
    if (x[0] !== d[id][0]) { movidas++; const delta = Math.abs(dias(d[id][0]) - dias(x[0])); soma += delta; if (delta > maior) maior = delta }
  }
  for (const id of Object.keys(a)) if (!d[id]) removidas++
  return { movidas, novas, removidas, deslocamentoMedioDias: movidas ? Math.round((soma / movidas) * 10) / 10 : 0, maiorDeslocamentoDias: maior }
}

export const mudancaGrande = (r: ResumoGrade, limiar: number): boolean => r.movidas + r.novas + r.removidas >= limiar
