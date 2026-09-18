import type { GamConfig } from './config'

/**
 * A gamificação está ATIVA para ESTE aluno? Gate central usado no engine (crédito de XP) e em toda a
 * UI do aluno (menu, hero, rail, ligas). Custo ZERO no modo 'todos' (padrão): retorna logo após o
 * flag `ativo`. No modo 'selecionados', o aluno participa se estiver vinculado individualmente OU via
 * um grupo (conexão viva — novos membros do grupo, manual ou por sync, entram automaticamente).
 * Tolerante: se as tabelas de público ainda não migraram, não bloqueia (cai no comportamento global).
 */
export async function gamAtivaParaAluno(
  svc: any,
  tenantId: string | null,
  estudanteId: string | null,
  config: GamConfig | null,
): Promise<boolean> {
  if (!config?.ativo) return false
  if (config.publicoModo !== 'selecionados') return true
  if (!tenantId || !estudanteId) return false
  try {
    const { data: ind } = await svc
      .from('simulado_gamificacao_estudantes')
      .select('estudante_id')
      .eq('tenant_id', tenantId).eq('estudante_id', estudanteId)
      .limit(1)
    if (ind && ind.length) return true
    const { data: grp } = await svc
      .from('simulado_gamificacao_grupos')
      .select('grupo_id')
      .eq('tenant_id', tenantId)
    const gids = (grp ?? []).map((r: any) => r.grupo_id)
    if (!gids.length) return false
    const { data: mem } = await svc
      .from('simulado_grupo_membros')
      .select('grupo_id')
      .eq('estudante_id', estudanteId).in('grupo_id', gids)
      .limit(1)
    return !!(mem && mem.length)
  } catch {
    return true // tabelas de público ainda não migradas → não bloquear
  }
}
