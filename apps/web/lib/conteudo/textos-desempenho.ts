import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'
import type { TextosDesempenho } from '@/lib/conteudo/previa-compute'

// Banco de TEXTOS de desempenho por tenant (narrativa por faixa de cada pilar). Guardado em
// simulado_tenants.tema.diagnostico_textos (jsonb) — SEM migração. Genérico (default) + override por slug.
const TENANTS = 'simulado_tenants'

export async function carregarTextosDesempenho(tenantId?: string | null): Promise<TextosDesempenho | null> {
  const tid = tenantId ?? (await getCurrentTenantId())
  if (!tid) return null
  try {
    const svc = createAdminClient()
    const { data } = await svc.from(TENANTS).select('tema').eq('id', tid).maybeSingle()
    return (((data as any)?.tema?.diagnostico_textos ?? null) as TextosDesempenho | null)
  } catch { return null }
}

export async function salvarTextosDesempenho(tenantId: string, textos: TextosDesempenho): Promise<{ ok: boolean; error?: string }> {
  try {
    const svc = createAdminClient()
    const { data } = await svc.from(TENANTS).select('tema').eq('id', tenantId).maybeSingle()
    const tema = { ...(((data as any)?.tema as Record<string, unknown>) ?? {}), diagnostico_textos: textos }
    const { error } = await svc.from(TENANTS).update({ tema }).eq('id', tenantId)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) { return { ok: false, error: (e as any)?.message || 'Falha ao salvar.' } }
}
