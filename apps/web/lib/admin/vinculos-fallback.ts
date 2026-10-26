import 'server-only'
import type { GrupoVinculadoRow, SimuladoVinculadoRow } from 'data'

/**
 * Fallback PostgREST da aba "Vínculos" do perfil do aluno. As fontes canônicas
 * (`gruposVinculadosAlunoSql` / `simuladosVinculadosAlunoSql`) usam o caminho SQL agregado e
 * devolvem `null` quando ele está OFF (DATABASE_URL ausente / REPORT_SQL=off). Sem este fallback,
 * a aba mostra "0 grupos / nenhum simulado" mesmo com o aluno vinculado. Replica as MESMAS regras
 * das queries SQL via PostgREST (poucas linhas por aluno → barato). Só é chamado quando o SQL = null.
 */

type Svc = any

/** Grupos (não-mestre, não deletados) de que o aluno é membro + contagem de alunos de cada. */
export async function gruposVinculadosFallback(svc: Svc, tenantId: string, estudanteId: string): Promise<GrupoVinculadoRow[]> {
  const { data: gm } = await svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId)
  const gids = [...new Set((gm ?? []).map((r: any) => r.grupo_id).filter(Boolean))] as string[]
  if (!gids.length) return []
  const { data: gs } = await svc.from('simulado_grupos').select('id, nome, cor, is_mestre, deletado').eq('tenant_id', tenantId).in('id', gids)
  const visiveis = (gs ?? []).filter((g: any) => g.deletado === false && !g.is_mestre)
  const out: GrupoVinculadoRow[] = []
  for (const g of visiveis) {
    // head+count: conta membros sem puxar as linhas (grupos podem ter milhares).
    const { count } = await svc.from('simulado_grupo_membros').select('estudante_id', { count: 'exact', head: true }).eq('grupo_id', g.id)
    out.push({ id: g.id, nome: g.nome ?? null, cor: g.cor ?? null, membros: count ?? 0 })
  }
  return out.sort((a, b) => (a.nome ?? '').localeCompare(b.nome ?? '', 'pt-BR'))
}

/** Simulados a que o aluno tem acesso: matrícula ∪ acesso avulso ∪ simulados dos grupos dele. */
export async function simuladosVinculadosFallback(svc: Svc, tenantId: string, estudanteId: string): Promise<SimuladoVinculadoRow[]> {
  const ids = new Set<string>()
  const [mat, aces, gm] = await Promise.all([
    svc.from('simulado_matriculas').select('simulado_id').eq('tenant_id', tenantId).eq('estudante_id', estudanteId),
    svc.from('simulado_acessos').select('simulado_id').eq('tenant_id', tenantId).eq('estudante_id', estudanteId),
    svc.from('simulado_grupo_membros').select('grupo_id').eq('estudante_id', estudanteId),
  ])
  for (const r of (mat.data ?? []) as any[]) if (r.simulado_id) ids.add(r.simulado_id)
  for (const r of (aces.data ?? []) as any[]) if (r.simulado_id) ids.add(r.simulado_id)
  const gids = [...new Set(((gm.data ?? []) as any[]).map((r) => r.grupo_id).filter(Boolean))] as string[]
  if (gids.length) {
    // Link direto grupo→simulado (tabela pode não existir em todos os ambientes → tolerante).
    try {
      const { data: gsi } = await svc.from('simulado_grupo_simulado').select('simulado_id').in('grupo_id', gids)
      for (const r of (gsi ?? []) as any[]) if (r.simulado_id) ids.add(r.simulado_id)
    } catch { /* ignora */ }
  }
  if (!ids.size) return []
  const { data: sims } = await svc.from('simulado_simulados').select('id, titulo, status').eq('tenant_id', tenantId).eq('deletado', false).in('id', [...ids])
  return ((sims ?? []) as any[])
    .map((s) => ({ id: s.id, titulo: s.titulo ?? null, status: s.status ?? null }))
    .sort((a, b) => (a.titulo ?? '').localeCompare(b.titulo ?? '', 'pt-BR'))
}
