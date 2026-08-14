export type ProvaRef = { id: string; titulo: string; numero: number | null }

/**
 * Para um lote de questões, resolve em quais SIMULADOS cada uma já foi usada (via a junção
 * `simulado_prova_questoes`) e a POSIÇÃO dela em cada prova (`ordem` é 0-based → número = ordem+1).
 * Ignora simulados deletados e rascunhos — não vaza prova futura ao aluno. `svc` = service-role.
 */
export async function provasPorQuestao(svc: any, tenantId: string, ids: string[]): Promise<Map<string, ProvaRef[]>> {
  const map = new Map<string, ProvaRef[]>()
  if (!ids.length) return map

  const { data: vinc } = await svc
    .from('simulado_prova_questoes')
    .select('questao_id, simulado_id, ordem')
    .in('questao_id', ids)
  const vincList = (vinc ?? []) as { questao_id: string; simulado_id: string; ordem: number | null }[]
  if (!vincList.length) return map

  const simIds = [...new Set(vincList.map((v) => v.simulado_id).filter(Boolean))]
  const { data: sims } = simIds.length
    ? await svc.from('simulado_simulados').select('id, titulo, status, deletado').eq('tenant_id', tenantId).in('id', simIds).is('owner_estudante_id', null)
    : { data: [] as any[] }

  const simMap = new Map<string, { id: string; titulo: string }>()
  for (const s of (sims ?? []) as any[]) {
    if (s.deletado || s.status === 'rascunho') continue
    simMap.set(s.id, { id: s.id, titulo: s.titulo ?? 'Simulado' })
  }

  for (const v of vincList) {
    const base = simMap.get(v.simulado_id)
    if (!base) continue
    const arr = map.get(v.questao_id) ?? []
    if (!arr.some((x) => x.id === base.id)) {
      arr.push({ id: base.id, titulo: base.titulo, numero: v.ordem != null ? Number(v.ordem) + 1 : null })
    }
    map.set(v.questao_id, arr)
  }
  // Dentro de cada questão, ordena as provas pela posição (número) para exibição estável.
  for (const [k, arr] of map) map.set(k, arr.sort((a, b) => (a.numero ?? 1e9) - (b.numero ?? 1e9)))
  return map
}
