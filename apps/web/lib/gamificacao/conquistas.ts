import { getGamConfig } from './config'
import { awardXp } from './xp'

/**
 * Avalia as conquistas ainda não desbloqueadas contra os stats atuais do aluno e desbloqueia
 * as cumpridas (INSERT idempotente). Concede o XP da conquista quando definido.
 * Só calcula stats caros (sessões) quando alguma conquista pendente precisa deles.
 */
export async function avaliarConquistas(svc: any, { tenantId, estudanteId }: { tenantId: string; estudanteId: string }): Promise<void> {
  const config = await getGamConfig(svc, tenantId)
  if (!config?.ativo) return
  const defs = config.conquistas_def ?? []
  if (!defs.length) return

  const [{ data: cacheRow }, jaResp] = await Promise.all([
    svc.from('simulado_gamificacao_estudante').select('xp_total, streak_atual').eq('tenant_id', tenantId).eq('estudante_id', estudanteId).maybeSingle(),
    svc.from('simulado_conquista_desbloqueios').select('conquista_id').eq('tenant_id', tenantId).eq('estudante_id', estudanteId),
  ])
  const desbloqueadas = new Set((jaResp.data ?? []).map((r: any) => r.conquista_id))
  const pendentes = defs.filter((d) => !desbloqueadas.has(d.id))
  if (!pendentes.length) return

  let simuladosConcluidos = 0
  let notaMax = 0
  if (pendentes.some((d) => d.regra?.tipo === 'simulados_concluidos' || d.regra?.tipo === 'nota_max')) {
    const { data: sess } = await svc
      .from('simulado_sessoes_prova')
      .select('simulado_id, nota')
      .eq('estudante_id', estudanteId).eq('status', 'finalizada').eq('is_teste', false).eq('deletado', false)
    const arr = (sess ?? []) as any[]
    simuladosConcluidos = new Set(arr.map((s) => s.simulado_id)).size
    notaMax = arr.reduce((m, s) => Math.max(m, s.nota != null ? Number(s.nota) : 0), 0)
  }
  const stats = {
    xp_total: cacheRow?.xp_total ?? 0,
    streak: cacheRow?.streak_atual ?? 0,
    simulados_concluidos: simuladosConcluidos,
    nota_max: notaMax,
  }
  const cumpre = (d: (typeof defs)[number]): boolean => {
    const meta = d.regra?.meta ?? 0
    switch (d.regra?.tipo) {
      case 'xp_total': return stats.xp_total >= meta
      case 'streak': return stats.streak >= meta
      case 'simulados_concluidos': return stats.simulados_concluidos >= meta
      case 'nota_max': return stats.nota_max >= meta
      default: return false
    }
  }

  for (const d of pendentes) {
    if (!cumpre(d)) continue
    const { data: ins } = await svc
      .from('simulado_conquista_desbloqueios')
      .upsert([{ tenant_id: tenantId, estudante_id: estudanteId, conquista_id: d.id }], { onConflict: 'tenant_id,estudante_id,conquista_id', ignoreDuplicates: true })
      .select('id')
    if (ins?.length && d.xp) await awardXp(svc, { tenantId, estudanteId, origem: 'conquista', refId: d.id, xp: d.xp, meta: { conquista: d.id } })
  }
}
