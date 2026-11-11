import 'server-only'

import { fetchAllByIn } from '@/lib/supabase/fetch-all'

/**
 * Validações de referência (tipo, pacotes, questões, categoria) para gravações em LOTE, sempre
 * escopadas ao tenant. Devolvem o que FALTA — vazio = tudo válido.
 */

/** Slugs de tipo de meta que não existem ou estão inativos no cadastro do tenant. */
export async function tiposInvalidos(svc: any, tenantId: string, slugs: string[]): Promise<string[]> {
  const unicos = [...new Set(slugs)]
  if (!unicos.length) return []
  const { data } = await svc
    .from('simulado_cronograma_tipos_meta')
    .select('slug')
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .in('slug', unicos.slice(0, 200))
  const ok = new Set(((data ?? []) as { slug: string }[]).map((t) => t.slug))
  return unicos.filter((s) => !ok.has(s))
}

/** Ids que NÃO pertencem ao tenant (ou não existem) na tabela indicada. */
export async function idsForaDoTenant(
  svc: any,
  tabela: 'simulado_cronograma_pacotes' | 'simulado_questoes' | 'simulado_cronograma_categorias',
  tenantId: string,
  ids: string[],
): Promise<string[]> {
  const unicos = [...new Set(ids)]
  if (!unicos.length) return []
  const achados = await fetchAllByIn<{ id: string }>(unicos, (chunk) =>
    svc.from(tabela).select('id').eq('tenant_id', tenantId).in('id', chunk).order('id') as never,
  )
  const ok = new Set(achados.map((r) => r.id))
  return unicos.filter((i) => !ok.has(i))
}
