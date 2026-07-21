/**
 * Capa do BANCO que usa cada caderno (elo `simulado_pastas.caderno_id`). Um caderno vinculado a
 * um banco herda a capa dele na visualização (modal "Selecionar caderno" + cards de Cadernos de
 * Prova). Se o mesmo caderno estiver em >1 banco, usa o primeiro com capa. Tolerante às colunas.
 */
export async function capasDeBancoPorCaderno(svc: any, tenantId: string): Promise<Map<string, string>> {
  const sel = (cols: string) =>
    svc.from('simulado_pastas').select(cols).eq('tenant_id', tenantId).eq('deletado', false).not('caderno_id', 'is', null)
  let r = await sel('caderno_id, capa_card_url, capa_url')
  if (r.error && /capa_card_url/i.test(r.error.message)) r = await sel('caderno_id, capa_url')
  if (r.error) return new Map()
  const map = new Map<string, string>()
  for (const b of (r.data ?? []) as any[]) {
    const capa = (b.capa_card_url ?? b.capa_url) as string | null
    if (b.caderno_id && capa && !map.has(b.caderno_id)) map.set(b.caderno_id, capa)
  }
  return map
}
