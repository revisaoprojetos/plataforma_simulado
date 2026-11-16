// Núcleo PURO (sem I/O, sem 'server-only') da regra "grupo dentro/fora da matriz" (decisão 16/11/2026), usado por
// regras-produto.ts e pelos testes (matriz-grupos.test.ts).
//
//  D1) Só ficam com liberação por regra os grupos DENTRO da matriz (referenciados na regra de algum segmento com linha ativa
//      de liberação do produto). Grupo vinculado ao produto FORA da matriz = liberação TOTAL.
//  D2) (a) aluno com algum grupo vinculado FORA da matriz → liberação total (a regra restritiva do outro grupo não tira acesso);
//      (b) todos os grupos dele na matriz → valem as regras; várias casando: menor `prioridade`, empate = mais ANTIGA (criado_em).

export interface MembroGrupo { expira_em: string | null }

/** Grupos do aluno (participação vigente), vinculados ao produto e FORA da matriz. Vazio = as regras valem normalmente. */
export function gruposForaDaMatriz(
  vinculados: Iterable<string>, naMatriz: ReadonlySet<string>, meus: ReadonlyMap<string, MembroGrupo>, agoraIso: string,
): string[] {
  const out: string[] = []
  for (const g of vinculados) {
    const m = meus.get(g)
    if (m && (!m.expira_em || m.expira_em > agoraIso) && !naMatriz.has(g)) out.push(g)
  }
  return out
}

/** Ordem de precedência entre regras que casam: menor `prioridade`; empate = criada primeiro (mais antiga). */
export const ordemRegra = (a: { prioridade: number; criado_em: string }, b: { prioridade: number; criado_em: string }) =>
  a.prioridade - b.prioridade || (a.criado_em < b.criado_em ? -1 : a.criado_em > b.criado_em ? 1 : 0)

/** Regra vencedora entre as que casam (null = nenhuma). */
export function regraVencedora<T extends { prioridade: number; criado_em: string }>(casando: T[]): T | null {
  return casando.length ? [...casando].sort(ordemRegra)[0] : null
}
