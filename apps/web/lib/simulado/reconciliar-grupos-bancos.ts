import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { matricularEmSimuladosDoBanco } from './matricular-banco'

export interface ReconcileResult {
  links: number
  pastaInseridos: number
  matriculasInseridas: number
}

/**
 * SELF-HEALING do elo grupo→banco. Para TODO vínculo `simulado_pasta_grupos`, garante que
 * cada membro do grupo esteja na pasta (`simulado_pasta_estudantes`) e matriculado nos
 * simulados que herdam do banco (`simulado_matriculas`, gate de acesso).
 *
 * É a rede de segurança para quando a propagação inline (webhook Guru, sync Curseduca,
 * add manual, vínculo do grupo) não roda — seja por lag de deploy, timing (banco vinculado
 * DEPOIS do membro entrar) ou erro transitório. Idempotente e paginado (aguenta grupos com
 * milhares de membros sem bater no teto de 1000 do PostgREST). Roda por CRON periódico.
 *
 * `svc` deve ser admin (bypassa RLS) — varre todos os tenants pelo `tenant_id` de cada vínculo.
 */
export async function reconciliarGruposBancos(
  svc: any,
  opts: { tenantId?: string; maxTrabalho?: number } = {},
): Promise<ReconcileResult> {
  const maxTrabalho = opts.maxTrabalho ?? 50000
  const links = await fetchAll<{ tenant_id: string; pasta_id: string; grupo_id: string }>(() => {
    let q = svc.from('simulado_pasta_grupos').select('tenant_id, pasta_id, grupo_id')
    if (opts.tenantId) q = q.eq('tenant_id', opts.tenantId)
    return q.order('pasta_id', { ascending: true })
  })

  let pastaInseridos = 0
  let matriculasInseridas = 0

  for (const l of links) {
    const { tenant_id: tenantId, pasta_id: pastaId, grupo_id: grupoId } = l
    if (!tenantId || !pastaId || !grupoId) continue

    // Membros do grupo (paginado).
    const membros = await fetchAll<{ estudante_id: string }>(() =>
      svc.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', grupoId).order('estudante_id', { ascending: true }))
    const estIds = [...new Set(membros.map((m) => m.estudante_id).filter(Boolean))]
    if (!estIds.length) continue

    // Quem já está na pasta (chunked) → insere os que faltam.
    const ja = await fetchAllByIn<{ estudante_id: string }>(estIds, (chunk) =>
      svc.from('simulado_pasta_estudantes').select('estudante_id').eq('pasta_id', pastaId).in('estudante_id', chunk).order('estudante_id', { ascending: true }))
    const jaSet = new Set(ja.map((r) => r.estudante_id))
    const novos = estIds.filter((id) => !jaSet.has(id))
    for (let i = 0; i < novos.length; i += 500) {
      const lote = novos.slice(i, i + 500)
      const { error } = await svc.from('simulado_pasta_estudantes').insert(lote.map((estudante_id) => ({ tenant_id: tenantId, pasta_id: pastaId, estudante_id })))
      if (!error) pastaInseridos += lote.length
    }

    // Matrícula nos simulados do banco (idempotente + chunked). Reconcilia TODOS os membros,
    // não só os recém-inseridos — cobre o caso "está na pasta mas ficou sem matrícula".
    try {
      matriculasInseridas += await matricularEmSimuladosDoBanco(svc, tenantId, pastaId, estIds)
    } catch { /* best-effort: um banco problemático não trava os demais */ }

    if (pastaInseridos + matriculasInseridas >= maxTrabalho) break
  }

  return { links: links.length, pastaInseridos, matriculasInseridas }
}
