import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { CATALOGO_HTML } from './catalogo-html'
import { catalogoIdEfetivo, normalizarOverride, type CatalogoOverride } from './catalogo-override'

/**
 * Persistência do overlay do catálogo de metas (tabela simulado_cronograma_adaptativo_catalogo, 1 linha/tenant).
 * Tolerante: tabela ausente (migração ainda não aplicada) ou erro de leitura = SEM overlay (comportamento atual).
 */
const T = 'simulado_cronograma_adaptativo_catalogo'
const kRow = (t: string) => `crono-cat-ov:${t}`

export interface LinhaOverride { versao: number; dados: CatalogoOverride; atualizadoEm: string | null; atualizadoPor: string | null }

/** Lê o overlay do tenant (cache 30s; `salvarOverride` invalida na hora). */
export async function lerOverrideRow(svc: SupabaseClient, tenantId: string): Promise<LinhaOverride | null> {
  return remember<LinhaOverride | null>(kRow(tenantId), 30, async () => {
    try {
      const { data, error } = await svc.from(T).select('versao, dados, atualizado_em, atualizado_por').eq('tenant_id', tenantId).maybeSingle()
      if (error || !data) return null
      const r = data as { versao: number; dados: unknown; atualizado_em: string | null; atualizado_por: string | null }
      return { versao: Number(r.versao) || 0, dados: normalizarOverride(r.dados), atualizadoEm: r.atualizado_em, atualizadoPor: r.atualizado_por }
    } catch { return null }
  })
}

export async function lerOverride(svc: SupabaseClient, tenantId: string): Promise<CatalogoOverride | null> {
  return (await lerOverrideRow(svc, tenantId))?.dados ?? null
}

/** Id do catálogo EFETIVO (base + versão do overlay): é o que os planos carimbam em `cfg.catalogo`. */
export async function catalogoIdDoTenant(svc: SupabaseClient, tenantId: string): Promise<string> {
  const row = await lerOverrideRow(svc, tenantId)
  return catalogoIdEfetivo(CATALOGO_HTML.id, row?.versao ?? 0)
}

/** Grava o overlay com checagem otimista: `versaoBase` = a versão que o admin carregou (0 = ainda não existia). */
export async function salvarOverride(
  svc: SupabaseClient, tenantId: string, dados: CatalogoOverride, versaoBase: number, atorId: string | null,
): Promise<{ ok: boolean; error?: string; conflito?: boolean; versao?: number }> {
  const limpo = normalizarOverride(dados)
  const agora = new Date().toISOString()
  try {
    if (versaoBase <= 0) {
      const { error } = await svc.from(T).insert({ tenant_id: tenantId, versao: 1, dados: limpo, atualizado_em: agora, atualizado_por: atorId })
      if (error) {
        if (/duplicate|unique|23505/i.test(error.message + (error.code ?? ''))) return { ok: false, conflito: true, error: 'O catálogo foi alterado por outra pessoa. Recarregue a página.' }
        if (/does not exist|relation|schema cache|42P01|PGRST205/i.test(error.message + (error.code ?? ''))) return { ok: false, error: 'Tabela do catálogo ainda não existe. Aplique a migração 20261104130000_cronograma_adaptativo_catalogo_override.sql.' }
        return { ok: false, error: error.message }
      }
      await esquecer(kRow(tenantId)).catch(() => {})
      return { ok: true, versao: 1 }
    }
    const { data, error } = await svc.from(T)
      .update({ versao: versaoBase + 1, dados: limpo, atualizado_em: agora, atualizado_por: atorId })
      .eq('tenant_id', tenantId).eq('versao', versaoBase).select('versao')
    if (error) return { ok: false, error: error.message }
    if (!data || !data.length) return { ok: false, conflito: true, error: 'O catálogo foi alterado por outra pessoa. Recarregue a página.' }
    await esquecer(kRow(tenantId)).catch(() => {})
    return { ok: true, versao: versaoBase + 1 }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao salvar o catálogo.' }
  }
}
