// Tipo do simulado derivado das suas questões (não há coluna própria).
// objetiva = só questões objetivas | discursiva = só discursivas | mista = as duas.

export type TipoSimulado = 'objetiva' | 'discursiva' | 'mista'

/** Deriva o tipo a partir dos `tipo` das questões (qualquer coisa != 'discursiva' conta como objetiva). */
export function tipoDoSimulado(tipos: (string | null | undefined)[]): TipoSimulado | null {
  let obj = false, dis = false
  for (const t of tipos) {
    if (t === 'discursiva') dis = true
    else if (t) obj = true
  }
  if (obj && dis) return 'mista'
  if (dis) return 'discursiva'
  if (obj) return 'objetiva'
  return null
}

/** Filtra as modalidades de caderno conforme o tipo do simulado:
 *  objetiva → sem "Caderno Discursivo"; discursiva → sem "Caderno Objetivo"; mista/nulo → todas.
 *  (Mantém Completo, Diagnóstico e quaisquer modalidades personalizadas.) */
export function filtrarModsPorTipo<M extends { id: string }>(mods: M[], tipo: TipoSimulado | null): M[] {
  if (tipo === 'objetiva') return mods.filter((m) => m.id !== 'gabarito_discursivo')
  if (tipo === 'discursiva') return mods.filter((m) => m.id !== 'gabarito_objetivo')
  return mods
}

/** Busca em lote o tipo de vários simulados (uma query só). `svc` = cliente supabase. */
export async function tiposDeSimulados(svc: any, simuladoIds: string[]): Promise<Map<string, TipoSimulado | null>> {
  const map = new Map<string, TipoSimulado | null>()
  const ids = [...new Set(simuladoIds.filter(Boolean))]
  if (!ids.length) return map
  const { data } = await svc
    .from('simulado_prova_questoes')
    .select('simulado_id, questoes:simulado_questoes(tipo)')
    .in('simulado_id', ids)
  const porSim = new Map<string, string[]>()
  for (const r of (data ?? []) as any[]) {
    const t = r.questoes?.tipo
    const arr = porSim.get(r.simulado_id) ?? []
    arr.push(t)
    porSim.set(r.simulado_id, arr)
  }
  for (const id of ids) map.set(id, tipoDoSimulado(porSim.get(id) ?? []))
  return map
}
