import { matricularEmSimuladosDoBanco } from './matricular-banco'

/**
 * Elo grupo→banco em TEMPO REAL: dá aos estudantes o acesso dos BANCOS vinculados ao grupo
 * (`simulado_pasta_grupos`) — entra na pasta (`simulado_pasta_estudantes`) e matricula nos
 * simulados que herdam do banco. Idempotente (só insere o que falta) e tolerante a erro
 * (nunca derruba o fluxo que adicionou o membro). Chame SEMPRE que alguém entra num grupo.
 */
export async function propagarGrupoAosBancos(
  svc: any,
  tenantId: string,
  grupoId: string,
  estudanteIds: string[],
): Promise<void> {
  const ids = [...new Set((estudanteIds ?? []).filter(Boolean))]
  if (!ids.length || !grupoId) return
  try {
    const { data: links } = await svc.from('simulado_pasta_grupos').select('pasta_id').eq('grupo_id', grupoId)
    const bancoIds = [...new Set((links ?? []).map((l: any) => l.pasta_id).filter(Boolean))] as string[]
    for (const pastaId of bancoIds) {
      // Quem já está na pasta (checado em chunks p/ respeitar o teto do PostgREST no .in()).
      const ja = new Set<string>()
      for (let i = 0; i < ids.length; i += 300) {
        const chunk = ids.slice(i, i + 300)
        const { data } = await svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', pastaId).in('estudante_id', chunk)
        for (const r of (data ?? []) as any[]) ja.add(r.estudante_id)
      }
      const novos = ids.filter((id) => !ja.has(id))
      for (let i = 0; i < novos.length; i += 500) {
        await svc.from('simulado_pasta_estudantes').insert(novos.slice(i, i + 500).map((estudante_id: string) => ({ tenant_id: tenantId, pasta_id: pastaId, estudante_id })))
      }
      // Matricula nos simulados que herdam do banco (idempotente).
      try { await matricularEmSimuladosDoBanco(svc, tenantId, pastaId, ids) } catch { /* best-effort */ }
    }
  } catch {
    /* propagação nunca deve bloquear o fluxo principal */
  }
}
