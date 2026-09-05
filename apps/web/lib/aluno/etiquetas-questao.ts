import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'

export type EtiquetaCard = { nome: string; cor: string | null }

/**
 * Map questaoId -> etiquetas [{nome, cor}] para um conjunto de questões (badges do card do aluno).
 * Usa 2 queries + join em memória (evita o embed PostgREST, que quebra se a FK renomeada não for
 * detectada). Tolerante: sem etiquetas, devolve mapa vazio.
 */
export async function etiquetasPorQuestao(svc: SupabaseClient, tenantId: string, ids: string[]): Promise<Map<string, EtiquetaCard[]>> {
  const map = new Map<string, EtiquetaCard[]>()
  if (!ids.length) return map
  // CHUNK: `.in('questao_id', ids)` sem fatiar trava o proxy do Supabase (~180s) quando `ids` é
  // grande (aluno com muitos favoritos / caderno grande). fetchAllByIn fatia em lotes de 80.
  const links = await fetchAllByIn<{ questao_id: string; etiqueta_id: string }>(
    ids,
    (chunk) => svc.from('simulado_questao_etiquetas').select('questao_id, etiqueta_id').eq('tenant_id', tenantId).in('questao_id', chunk).order('questao_id', { ascending: true }),
  )
  const etIds = [...new Set(links.map((l) => l.etiqueta_id as string))]
  if (!etIds.length) return map
  const { data: ets } = await svc.from('simulado_etiquetas').select('id, nome, cor').eq('tenant_id', tenantId).in('id', etIds)
  const etMap = new Map(((ets ?? []) as any[]).map((e) => [e.id as string, { nome: e.nome as string, cor: (e.cor ?? null) as string | null }]))
  for (const l of links) {
    const et = etMap.get(l.etiqueta_id)
    if (!et) continue
    const arr = map.get(l.questao_id) ?? []
    arr.push(et)
    map.set(l.questao_id, arr)
  }
  return map
}
