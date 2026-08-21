import 'server-only'

/**
 * Carrega o cadastro de tipos de meta do tenant, no formato que o motor consome.
 *
 * Existe num arquivo próprio porque três lugares precisam dele — a tela do aluno, a
 * reabertura de emissão e o admin — e duplicar a query levaria a divergência.
 */

import { createAdminClient } from '@/lib/supabase/server'
import type { MapaTipos, TipoMetaDef } from './tipos'

const SEM_TENANT = '00000000-0000-0000-0000-000000000000'

export async function listarTiposMeta(tenantId: string | null, incluirInativos = false): Promise<TipoMetaDef[]> {
  const svc = createAdminClient()
  let q = svc
    .from('simulado_cronograma_tipos_meta')
    .select('id, slug, nome, rotulo_docx, ordem, cor, ativo, mostra_links, prefixo_aula, aula_no_titulo, quebra_conteudo, conta_atividade, destaque_docx, sempre_no_docx')
    .eq('tenant_id', tenantId ?? SEM_TENANT)
    .order('ordem')
    .order('nome')
  if (!incluirInativos) q = q.eq('ativo', true)
  const { data } = await q
  return ((data ?? []) as any[]).map((t) => ({ ...t })) as TipoMetaDef[]
}

export async function mapaTiposMeta(tenantId: string | null): Promise<MapaTipos> {
  const tipos = await listarTiposMeta(tenantId)
  return new Map(tipos.map((t) => [t.slug, t]))
}
