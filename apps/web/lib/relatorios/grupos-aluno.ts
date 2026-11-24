import 'server-only'
import { createAdminClient } from '@/lib/supabase/server'
import { gruposPorAlunoSql, filtrarOrdenarPaginar, grupoIdValido, type FiltroGrupos, type LinhaGrupoAlunoSql, type OrdGrupos } from './agregados-sql'

type RpcLinha = { estudante_id: string; nome: string | null; total: number; ultimo_em: string | null; grupos: any }

export const GRUPOS_POR_PAGINA = 25

export function normalizarFiltroGrupos(sp: { q?: string; grupo?: string; ord?: string; dir?: string }): FiltroGrupos {
  const ord: OrdGrupos = sp.ord === 'nome' || sp.ord === 'total' ? sp.ord : 'recente'
  const dir: 'asc' | 'desc' = sp.dir === 'asc' || sp.dir === 'desc' ? sp.dir : ord === 'nome' ? 'asc' : 'desc'
  return { q: (sp.q ?? '').slice(0, 100), grupo: grupoIdValido(sp.grupo), ord, dir }
}

/** Página (ou o conjunto completo, `limit=null`) de "grupos por aluno": SQL direto com filtro/ordem/limit no
 *  banco; sem DATABASE_URL cai no RPC `rpc_grupos_por_aluno` + filtro/paginação em JS (comportamento anterior). */
export async function listarGruposPorAluno(tenantId: string, f: FiltroGrupos, limit: number | null, offset: number): Promise<{ linhas: LinhaGrupoAlunoSql[]; total: number }> {
  const viaSql = await gruposPorAlunoSql(tenantId, f, limit, offset)
  if (viaSql) return viaSql
  const { data } = await createAdminClient().rpc('rpc_grupos_por_aluno', { p_tenant: tenantId })
  const todas: LinhaGrupoAlunoSql[] = ((data ?? []) as RpcLinha[]).map((r) => ({
    id: r.estudante_id, nome: r.nome ?? 'Estudante', total: r.total, ultimoEm: r.ultimo_em, grupos: Array.isArray(r.grupos) ? r.grupos : [],
  }))
  return filtrarOrdenarPaginar(todas, f, limit, offset)
}
