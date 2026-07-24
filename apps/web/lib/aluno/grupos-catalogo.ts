/**
 * Resolve o "grupo" (pasta is_folder do banco) de cada simulado, para as fileiras do catálogo
 * do portal do aluno: regras.banco_base_id → banco (pasta) → pai is_folder = grupo.
 * Tolerante ao schema: se as colunas is_folder/pai_id não existirem, devolve sem grupos
 * (o componente cai no grid). Escopado pelos ids já acessíveis ao aluno (sem vazamento de tenant).
 */
export async function resolverGruposCatalogo(
  svc: any,
  itens: { id: string; regras: any }[],
): Promise<{ grupoPorSim: Map<string, string | null>; grupos: { id: string; nome: string }[] }> {
  const grupoPorSim = new Map<string, string | null>()
  let grupos: { id: string; nome: string }[] = []
  try {
    const bancoIds = [...new Set(itens.map((i) => (i.regras as any)?.banco_base_id).filter(Boolean))] as string[]
    if (bancoIds.length) {
      const { data: bancosRows } = await svc.from('simulado_pastas').select('id, pai_id, is_folder').in('id', bancoIds)
      const paiIds = [...new Set((bancosRows ?? []).map((b: any) => b.pai_id).filter(Boolean))] as string[]
      const { data: paisRows } = paiIds.length
        ? await svc.from('simulado_pastas').select('id, nome, is_folder').in('id', paiIds)
        : { data: [] as any[] }
      const bancoById = new Map<string, any>((bancosRows ?? []).map((b: any) => [b.id, b]))
      const paiById = new Map<string, any>((paisRows ?? []).filter((p: any) => p.is_folder).map((p: any) => [p.id, p]))
      const usados = new Map<string, string>()
      for (const i of itens) {
        const bid = (i.regras as any)?.banco_base_id
        const b = bid ? bancoById.get(bid) : null
        const pai = b?.pai_id ? paiById.get(b.pai_id) : null
        const gid = pai ? (pai.id as string) : null
        grupoPorSim.set(i.id, gid)
        if (gid && pai) usados.set(gid, pai.nome as string)
      }
      grupos = [...usados.entries()].map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
    }
  } catch { /* schema sem is_folder/pai_id → sem catálogo */ }
  return { grupoPorSim, grupos }
}
