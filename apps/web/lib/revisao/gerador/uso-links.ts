import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { sqlQuery } from '@/lib/data/sql'

export type UsoAulaQuest = { disciplina: string; aula: string; n: number }

/**
 * Metas de QUESTÕES com aula, agrupadas por (disciplina, aula) — base do "usos"/"pendentes" dos links de aula.
 * GROUP BY no banco (centenas de linhas) em vez de baixar as ~4,5 mil metas em ~5 idas ao PostgREST a cada abertura.
 * `disciplinas` limita às da página. Sem DATABASE_URL / SQL falhando: leitura paginada de antes (mesmo resultado).
 */
export async function metasQuestPorAula(svc: SupabaseClient, tenantId: string, disciplinas?: string[]): Promise<UsoAulaQuest[]> {
  if (disciplinas && !disciplinas.length) return []
  const rows = await sqlQuery<{ disciplina: string; aula: string; n: number }>(
    `SELECT disciplina, aula, count(*)::int n FROM simulado_cronograma_metas
      WHERE tenant_id = $1 AND tipo = 'quest' AND aula IS NOT NULL ${disciplinas ? 'AND disciplina = ANY($2::text[])' : ''}
      GROUP BY 1, 2 ORDER BY 1, 2`,
    disciplinas ? [tenantId, disciplinas] : [tenantId],
  )
  if (rows) return rows.map((r) => ({ disciplina: r.disciplina, aula: r.aula, n: Number(r.n) || 0 }))
  const base = (b: any) => b.eq('tenant_id', tenantId).eq('tipo', 'quest').not('aula', 'is', null)
  const brutas = disciplinas
    ? await fetchAllByIn<{ disciplina: string; aula: string }>(disciplinas, (c) => base(svc.from('simulado_cronograma_metas').select('disciplina, aula')).in('disciplina', c).order('id') as any)
    : await fetchAll<{ disciplina: string; aula: string }>(() => base(svc.from('simulado_cronograma_metas').select('disciplina, aula')).order('id') as any)
  const m = new Map<string, UsoAulaQuest>()
  for (const b of brutas) { const k = `${b.disciplina}\u0000${b.aula}`; const e = m.get(k); if (e) e.n++; else m.set(k, { disciplina: b.disciplina, aula: b.aula, n: 1 }) }
  return [...m.values()]
}
