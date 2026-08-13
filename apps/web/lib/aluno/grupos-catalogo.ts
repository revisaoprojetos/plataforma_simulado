export type GrupoCatalogo = { id: string; nome: string; cor: string | null; icone: string | null; capa: string | null; capaCard: string | null }

/**
 * Resolve o "grupo" (pasta is_folder do banco) de cada simulado, para as PASTAS do catálogo
 * do portal do aluno: regras.banco_base_id → banco (pasta) → pai is_folder = grupo.
 * Também traz o visual do grupo (cor/ícone/capa) para o card de pasta.
 * Tolerante ao schema: se as colunas não existirem, devolve sem grupos (o componente cai no grid).
 * Escopado pelos ids já acessíveis ao aluno (sem vazamento de tenant).
 */
export async function resolverGruposCatalogo(
  svc: any,
  itens: { id: string; regras: any }[],
): Promise<{ grupoPorSim: Map<string, string | null>; grupos: GrupoCatalogo[] }> {
  const grupoPorSim = new Map<string, string | null>()
  let grupos: GrupoCatalogo[] = []
  try {
    const bancoIds = [...new Set(itens.map((i) => (i.regras as any)?.banco_base_id).filter(Boolean))] as string[]
    if (bancoIds.length) {
      const { data: bancosRows } = await svc.from('simulado_pastas').select('id, pai_id, is_folder').in('id', bancoIds)
      const paiIds = [...new Set((bancosRows ?? []).map((b: any) => b.pai_id).filter(Boolean))] as string[]
      // Visual do grupo (cor/ícone/capa) é tolerante: se as colunas não existirem, cai no select mínimo.
      let paisRows: any[] = []
      if (paiIds.length) {
        const r = await svc.from('simulado_pastas').select('id, nome, is_folder, cor, icone, capa_url, capa_card_url').in('id', paiIds)
        if (r.error) { const r2 = await svc.from('simulado_pastas').select('id, nome, is_folder').in('id', paiIds); paisRows = r2.data ?? [] }
        else paisRows = r.data ?? []
      }
      const bancoById = new Map<string, any>((bancosRows ?? []).map((b: any) => [b.id, b]))
      const paiById = new Map<string, any>((paisRows).filter((p: any) => p.is_folder).map((p: any) => [p.id, p]))
      const usados = new Map<string, GrupoCatalogo>()
      for (const i of itens) {
        const bid = (i.regras as any)?.banco_base_id
        const b = bid ? bancoById.get(bid) : null
        const pai = b?.pai_id ? paiById.get(b.pai_id) : null
        const gid = pai ? (pai.id as string) : null
        grupoPorSim.set(i.id, gid)
        if (gid && pai) usados.set(gid, { id: gid, nome: pai.nome as string, cor: pai.cor ?? null, icone: pai.icone ?? null, capa: pai.capa_url ?? null, capaCard: pai.capa_card_url ?? null })
      }
      grupos = [...usados.values()].sort((a, b) => a.nome.localeCompare(b.nome))
    }
  } catch { /* schema sem is_folder/pai_id → sem catálogo */ }
  return { grupoPorSim, grupos }
}
