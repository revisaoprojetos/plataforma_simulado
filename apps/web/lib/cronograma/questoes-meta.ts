import type { Grade } from './tipos'

/**
 * Contagem de questões (referência) por meta — vindas do banco de conteúdos ao compor.
 * `simulado_cronograma_meta_questoes` só tem linhas para metas que receberam questões, então
 * a tabela é pequena mesmo em cronogramas grandes.
 */
export async function contarQuestoesPorMeta(svc: any, tenantId: string, metaIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (!metaIds.length) return mapa
  for (let i = 0; i < metaIds.length; i += 300) {
    const chunk = metaIds.slice(i, i + 300)
    const { data } = await svc
      .from('simulado_cronograma_meta_questoes')
      .select('meta_id')
      .eq('tenant_id', tenantId)
      .in('meta_id', chunk)
    for (const r of (data ?? []) as { meta_id: string }[]) mapa.set(r.meta_id, (mapa.get(r.meta_id) ?? 0) + 1)
  }
  return mapa
}

/** Grava `qtdQuestoes` nas metas já datadas da grade (mutação in-place; no-op se vazio). */
export function aplicarQtdQuestoes(grade: Grade, contagem: Map<string, number>): void {
  if (!contagem.size) return
  for (const s of grade.semanas) {
    const metas = (s as { metas?: { id: string; qtdQuestoes?: number }[] }).metas
    if (!metas) continue
    for (const m of metas) {
      const n = contagem.get(m.id)
      if (n) m.qtdQuestoes = n
    }
  }
}
