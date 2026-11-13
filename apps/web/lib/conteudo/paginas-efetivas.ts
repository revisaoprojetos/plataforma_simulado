import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllByIn } from '@/lib/supabase/fetch-all'
import { carregarPastasCP } from '@/lib/conteudo/capa-pagina-server'
import { mapaPastas, resolverPaginaInicialDoc } from '@/lib/conteudo/capa-pagina'

/**
 * FUNÇÃO ÚNICA de "páginas efetivas" de um documento da Biblioteca (usada pelo Cronograma Adaptativo, pelo
 * cronograma de Revisão e pelo relatório de divergência):
 *   efetivas = versoes.paginas (versão ATUAL) − (página inicial − 1), mínimo 1.
 * A página inicial é a do documento ou a da pasta em lote mais próxima (mesma resolução do leitor).
 * Sem a migração da página inicial (colunas ausentes) ou sem contagem, degrada com segurança (inicio=1 / efetivas=null).
 */

export interface PaginasDoc { total: number | null; inicio: number; efetivas: number | null }

/** Regra pura: desconta as páginas anteriores à página inicial. null/0 → null (sem contagem). */
export function descontarPaginaInicial(total: number | null | undefined, inicio: number | null | undefined): number | null {
  const t = Number(total)
  if (!Number.isFinite(t) || t <= 0) return null
  const i = Number(inicio)
  const desc = Number.isFinite(i) && i > 1 ? Math.trunc(i) - 1 : 0
  return Math.max(1, t - desc)
}

export interface DocParaPaginas { id: string; pasta_id: string | null; versao_atual_id: string | null }

/** Mapa docId → páginas (total da versão atual, página inicial efetiva e páginas efetivas). `.in()` em lotes de 80. */
export async function paginasEfetivasDocs(svc: SupabaseClient, tenantId: string, docs: DocParaPaginas[]): Promise<Map<string, PaginasDoc>> {
  const out = new Map<string, PaginasDoc>()
  if (!docs.length) return out
  const verIds = [...new Set(docs.map((d) => d.versao_atual_id).filter(Boolean) as string[])]
  const pg = new Map<string, number>()
  try {
    const vs = await fetchAllByIn<{ id: string; paginas: number | null }>(verIds, (chunk) =>
      svc.from('simulado_conteudo_versoes').select('id, paginas').in('id', chunk).order('id') as never, { chunk: 80, concorrencia: 4, rotulo: 'paginas-efetivas:versoes' })
    for (const v of vs) if (v.paginas) pg.set(v.id, v.paginas)
  } catch { /* sem contagem: efetivas=null */ }

  // página inicial (doc → pasta em lote). Best-effort: migração ausente = 1.
  const inicioDoc = new Map<string, number | null>()
  let porId: ReturnType<typeof mapaPastas> | null = null
  try {
    const rows = await fetchAllByIn<{ id: string; pagina_inicial: number | null }>(docs.map((d) => d.id), (chunk) =>
      svc.from('simulado_conteudo_documentos').select('id, pagina_inicial').eq('tenant_id', tenantId).in('id', chunk).order('id') as never, { chunk: 80, concorrencia: 4, rotulo: 'paginas-efetivas:docs' })
    for (const r of rows) inicioDoc.set(r.id, r.pagina_inicial ?? null)
    porId = mapaPastas(await carregarPastasCP(svc, tenantId))
  } catch { porId = null }

  for (const d of docs) {
    const total = d.versao_atual_id ? pg.get(d.versao_atual_id) ?? null : null
    let inicio = 1
    if (porId) { const v = resolverPaginaInicialDoc(inicioDoc.get(d.id) ?? null, d.pasta_id, porId).valor; if (v && v > 1) inicio = v }
    out.set(d.id, { total, inicio, efetivas: descontarPaginaInicial(total, inicio) })
  }
  return out
}
