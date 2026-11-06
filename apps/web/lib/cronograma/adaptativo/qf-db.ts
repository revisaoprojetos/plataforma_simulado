import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { remember, esquecer } from '@/lib/cache/relatorio-cache'
import { normalizarFiltro, filtroVazio, type FiltroQuestoesMeta } from './qf'

/**
 * Filtro de questões da plataforma por META (aula) do Cronograma Adaptativo — 1 linha por (tenant, aula).
 * Tabela PRÓPRIA (simulado_cronograma_adaptativo_qf): ajustar um filtro NÃO versiona o catálogo, então não
 * migra os planos dos alunos. Leitura TOLERANTE: tabela ausente (migração pendente) = nenhum filtro.
 */
const T = 'simulado_cronograma_adaptativo_qf'
const kTenant = (t: string) => `crono-qf:${t}`

/** Todos os filtros do tenant, por chave de aula (só os não vazios). Cache 30s; `salvarFiltro` invalida. */
export async function lerFiltros(svc: SupabaseClient, tenantId: string): Promise<Record<string, FiltroQuestoesMeta>> {
  return remember<Record<string, FiltroQuestoesMeta>>(kTenant(tenantId), 30, async () => {
    try {
      const { data, error } = await svc.from(T).select('aula_key, filtro').eq('tenant_id', tenantId)
      if (error || !data) return {}
      const out: Record<string, FiltroQuestoesMeta> = {}
      for (const r of data as Array<{ aula_key: string; filtro: unknown }>) {
        const f = normalizarFiltro(r.filtro)
        if (!filtroVazio(f)) out[r.aula_key] = f
      }
      return out
    } catch { return {} }
  })
}

export async function lerFiltro(svc: SupabaseClient, tenantId: string, aulaKey: string): Promise<FiltroQuestoesMeta | null> {
  return (await lerFiltros(svc, tenantId))[aulaKey] ?? null
}

/** Grava (ou remove, se vazio) o filtro de UMA aula. */
export async function salvarFiltro(
  svc: SupabaseClient, tenantId: string, aulaKey: string, filtro: unknown, atorId: string | null,
): Promise<{ ok: boolean; error?: string; removido?: boolean; filtro?: FiltroQuestoesMeta }> {
  const key = String(aulaKey || '').trim()
  if (!key || key.length > 240) return { ok: false, error: 'Aula inválida.' }
  const f = normalizarFiltro(filtro)
  try {
    if (filtroVazio(f)) {
      const { error } = await svc.from(T).delete().eq('tenant_id', tenantId).eq('aula_key', key)
      if (error && !/does not exist|schema cache|42P01|PGRST205/i.test(error.message + (error.code ?? ''))) return { ok: false, error: error.message }
      await esquecer(kTenant(tenantId)).catch(() => {})
      return { ok: true, removido: true, filtro: {} }
    }
    const { error } = await svc.from(T).upsert(
      { tenant_id: tenantId, aula_key: key, filtro: f, atualizado_em: new Date().toISOString(), atualizado_por: atorId },
      { onConflict: 'tenant_id,aula_key' },
    )
    if (error) {
      if (/does not exist|relation|schema cache|42P01|PGRST205/i.test(error.message + (error.code ?? ''))) {
        return { ok: false, error: 'Tabela dos filtros ainda não existe. Aplique a migração 20261106060000_cronograma_adaptativo_qf.sql.' }
      }
      return { ok: false, error: error.message }
    }
    await esquecer(kTenant(tenantId)).catch(() => {})
    return { ok: true, filtro: f }
  } catch (e) {
    return { ok: false, error: (e as Error)?.message || 'Falha ao salvar o filtro.' }
  }
}
