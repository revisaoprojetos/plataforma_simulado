import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { remember } from '@/lib/cache/relatorio-cache'
import { mapaPastas, resolverCapaDoc, resolverPaginaInicialDoc, type PastaCP } from './capa-pagina'

/**
 * Loaders server de capa/página inicial (regras puras em ./capa-pagina). Tolerantes: com a migração
 * 20261105010000 ausente, as colunas novas não existem → tudo cai no comportamento anterior (sem capa/página 1).
 */

/** Pastas da área 'conteudo' (id, pai_id, nome + campos de capa/página). Sem a migração, vêm só id/pai/nome. */
export async function carregarPastasCP(svc: SupabaseClient, tenantId: string): Promise<PastaCP[]> {
  const sel = (cols: string) => () => svc.from('simulado_pastas').select(cols).eq('tenant_id', tenantId).eq('folder_area', 'conteudo').eq('is_folder', true).order('id', { ascending: true })
  let rows: any[] = []
  try { rows = (await fetchAll<any>(sel('id, nome, pai_id, deletado, capa_url, capa_modo, pagina_inicial, pagina_inicial_modo'))) ?? [] }
  catch { try { rows = (await fetchAll<any>(sel('id, nome, pai_id, deletado'))) ?? [] } catch { rows = [] } }
  return rows.filter((p) => !p.deletado) as PastaCP[]
}

/**
 * Capa CUSTOMIZADA e página inicial EFETIVAS de um documento (a dele; senão a da pasta em lote mais próxima — mesma
 * resolução do leitor/cards). Usado no download do aluno. Migração ausente → sem capa / página 1.
 */
export async function capaEPaginaDoDocumento(svc: SupabaseClient, tenantId: string, documentoId: string): Promise<{ capaUrl: string | null; paginaInicial: number }> {
  try {
    const r1 = await svc.from('simulado_conteudo_documentos').select('pasta_id, capa_url, pagina_inicial').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
    if (r1.error || !r1.data) return { capaUrl: null, paginaInicial: 1 }
    const d = r1.data as { pasta_id: string | null; capa_url: string | null; pagina_inicial: number | null }
    const porId = mapaPastas(await carregarPastasCP(svc, tenantId))
    return {
      capaUrl: resolverCapaDoc(d.capa_url, d.pasta_id, porId).valor,
      paginaInicial: resolverPaginaInicialDoc(d.pagina_inicial, d.pasta_id, porId).valor ?? 1,
    }
  } catch { return { capaUrl: null, paginaInicial: 1 } }
}

/** Página inicial EFETIVA (≥ 1) de um documento: a dele, senão a da pasta em lote mais próxima, senão 1. Cache curto. */
export async function paginaInicialDoDocumento(documentoId: string): Promise<number> {
  const tenantId = await getCurrentTenantId()
  if (!tenantId || !documentoId) return 1
  return remember<number>(`pagina-inicial:${tenantId}:${documentoId}`, 60, async () => {
    try {
      const svc = createAdminClient()
      const r1 = await svc.from('simulado_conteudo_documentos').select('pasta_id, pagina_inicial').eq('tenant_id', tenantId).eq('id', documentoId).maybeSingle()
      if (r1.error || !r1.data) return 1 // coluna ausente (migração pendente) ou doc inexistente → documento inteiro
      const d = r1.data as { pasta_id: string | null; pagina_inicial: number | null }
      const pastas = await carregarPastasCP(svc, tenantId)
      return resolverPaginaInicialDoc(d.pagina_inicial, d.pasta_id, mapaPastas(pastas)).valor ?? 1
    } catch { return 1 }
  })
}
