import { createAdminClient } from '@/lib/supabase/server'
import { HUD_CORES_PADRAO, type HudCores, type HudPorPagina, type LoginLayout } from '@/lib/caderno-designer/types'

export interface HudConfigResolvido {
  base: HudCores
  porPagina: HudPorPagina
  /** id do caderno cujo tema/HUD foi aplicado (null = padrão) */
  cadernoId: string | null
  /** layout da tela de login do aluno (padrão = completo; centralizado = simples). */
  loginLayout: LoginLayout
}

const VAZIO: HudConfigResolvido = { base: HUD_CORES_PADRAO, porPagina: {}, cadernoId: null, loginLayout: 'padrao' }

function montar(config: any, cadernoId: string | null): HudConfigResolvido {
  const hc = config?.hudCores
  const base = hc ? { ...HUD_CORES_PADRAO, ...hc } : HUD_CORES_PADRAO
  const porPagina = config?.hudPorPagina && typeof config.hudPorPagina === 'object' ? (config.hudPorPagina as HudPorPagina) : {}
  const loginLayout: LoginLayout = config?.loginLayout === 'centralizado' ? 'centralizado' : 'padrao'
  return { base, porPagina, cadernoId, loginLayout }
}

/**
 * Resolve o HUD (cores/estilo por página) que se aplica a um simulado.
 * Ordem de prioridade:
 *   1) Vínculo explícito: simulado.regras.caderno_id (definido no admin do simulado).
 *   2) Heurística: questões do simulado → pastas (banco) → caderno.config.bancoId.
 *   3) Fallback: simulado_pastas.caderno_id (associação manual da pasta).
 * Sempre retorna cores válidas (cai no padrão quando não há caderno).
 */
export async function resolverHudConfig(simuladoId: string, tenantId?: string | null): Promise<HudConfigResolvido> {
  try {
    const svc = createAdminClient()

    // 1) Vínculo explícito do simulado.
    const { data: sim } = await svc.from('simulado_simulados').select('regras').eq('id', simuladoId).maybeSingle()
    const explicitId = (sim?.regras as { caderno_id?: string } | null)?.caderno_id
    if (explicitId) {
      const { data: cad } = await svc.from('simulado_cadernos_designer').select('id, config').eq('id', explicitId).maybeSingle()
      if ((cad?.config as { hudCores?: unknown } | null)?.hudCores) return montar(cad!.config, cad!.id as string)
    }

    // 2) Heurística por banco (pastas das questões).
    const { data: pq } = await svc.from('simulado_prova_questoes').select('questao_id').eq('simulado_id', simuladoId)
    const qids = [...new Set((pq ?? []).map((r: { questao_id: string }) => r.questao_id))]
    if (!qids.length) return VAZIO
    const { data: qp } = await svc.from('simulado_questao_pasta').select('pasta_id').in('questao_id', qids)
    const pastaIds = [...new Set((qp ?? []).map((r: { pasta_id: string }) => r.pasta_id))]
    if (!pastaIds.length) return VAZIO

    let query = svc.from('simulado_cadernos_designer').select('id, config, atualizado_em').order('atualizado_em', { ascending: false })
    if (tenantId) query = query.eq('tenant_id', tenantId)
    const { data: cads } = await query
    const matches = (cads ?? []).filter((c: { config: any }) => c.config?.bancoId && pastaIds.includes(c.config.bancoId))
    const chosen = matches.find((c: { config: any }) => c.config?.hudCores) ?? matches[0]
    if (chosen?.config?.hudCores) return montar(chosen.config, chosen.id as string)

    // 3) Fallback: pasta → caderno_id manual.
    try {
      const { data: pastas } = await svc.from('simulado_pastas').select('caderno_id').in('id', pastaIds)
      const cadId = (pastas ?? []).map((p: { caderno_id: string | null }) => p.caderno_id).find(Boolean)
      if (cadId) {
        const { data: cad } = await svc.from('simulado_cadernos_designer').select('id, config').eq('id', cadId).maybeSingle()
        if ((cad?.config as { hudCores?: unknown } | null)?.hudCores) return montar(cad!.config, cad!.id as string)
      }
    } catch { /* coluna caderno_id pode não existir */ }

    return VAZIO
  } catch {
    return VAZIO
  }
}
