import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import type { Grade } from './tipos'

/**
 * Contagem de questões (referência) por meta — vindas do banco de conteúdos ao compor.
 * `simulado_cronograma_meta_questoes` só tem linhas para metas que receberam questões, então
 * a tabela é pequena mesmo em cronogramas grandes.
 */
export async function contarQuestoesPorMeta(svc: any, tenantId: string, metaIds: string[]): Promise<Map<string, number>> {
  const mapa = new Map<string, number>()
  if (!metaIds.length) return mapa
  // fetchAllByIn: lote de 80 ids (URL curta) + paginação — um meta com várias questões fazia o
  // select cru de 300 ids passar de 1.000 linhas e a contagem truncava em silêncio.
  const linhas = await fetchAllByIn<{ id: string; meta_id: string }>(metaIds, (chunk) =>
    svc.from('simulado_cronograma_meta_questoes').select('id, meta_id').eq('tenant_id', tenantId).in('meta_id', chunk).order('id') as any,
    { concorrencia: 4 }, // 743 metas = 10 lotes: em ondas de 4 (antes 10 round-trips em série)
  )
  for (const r of linhas) mapa.set(r.meta_id, (mapa.get(r.meta_id) ?? 0) + 1)
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
