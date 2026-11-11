import 'server-only'
// Helpers server das actions CS (guard de permissão + tenant, validade de grupo, invalidação do Início do aluno).
import { checkPermission } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll, fetchAllByIn } from '@/lib/supabase/fetch-all'
import { esquecer, chaveRelatorio } from '@/lib/cache/relatorio-cache'
import { sqlQuery } from 'data'
import { brtLocalParaIso } from '@/lib/brt'

export type GuardOk = { ok: true; tenantId: string }
export type GuardErro = { ok: false; error: string }

/** checkPermission + tenant resolvido. TODA server action CS começa por aqui. */
export async function guardCs(permissao: string): Promise<GuardOk | GuardErro> {
  if (!(await checkPermission(permissao))) return { ok: false, error: 'Você não tem permissão para esta ação.' }
  const tenantId = await getCurrentTenantId()
  if (!tenantId) return { ok: false, error: 'Plataforma não resolvida. Recarregue a página.' }
  return { ok: true, tenantId }
}

export const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

/** Zera os caches de contagem de Membros/Grupos do tenant. */
export async function limparCachesCs(tenantId: string) {
  await Promise.all([
    esquecer(chaveRelatorio(tenantId, 'cs-membros-cont')),
    esquecer(chaveRelatorio(tenantId, 'cs-grupos-kpis')),
    esquecer(chaveRelatorio(tenantId, 'cs-grupos-opcoes', 0)),
    esquecer(chaveRelatorio(tenantId, 'cs-grupos-opcoes', 1)),
  ])
}

/** Validade padrão do grupo → `expira_em` (ISO) para NOVOS vínculos. null = sem expiração. undefined = grupo sem política. */
export async function expiraDoGrupo(tenantId: string, grupoId: string): Promise<string | null | undefined> {
  const svc = createAdminClient()
  const r = await svc.from('simulado_grupos').select('validade_tipo, validade_meses, validade_ate').eq('tenant_id', tenantId).eq('id', grupoId).maybeSingle()
  if (r.error || !r.data) return undefined
  const g = r.data as { validade_tipo: string | null; validade_meses: number | null; validade_ate: string | null }
  if (g.validade_tipo === 'meses_apos_compra' && g.validade_meses) {
    const d = new Date(); d.setMonth(d.getMonth() + g.validade_meses); return d.toISOString()
  }
  if (g.validade_tipo === 'ate_data' && g.validade_ate) return brtLocalParaIso(`${String(g.validade_ate).slice(0, 10)}T23:59`)
  if (g.validade_tipo === 'vitalicio') return null
  return undefined
}

/** Aplica a validade padrão do grupo aos vínculos recém-criados (tolerante: sem a coluna expira_em, ignora). */
export async function aplicarValidadeGrupo(tenantId: string, grupoId: string, estudanteIds: string[]) {
  if (!estudanteIds.length) return
  const expira = await expiraDoGrupo(tenantId, grupoId)
  if (expira === undefined) return
  const svc = createAdminClient()
  for (let i = 0; i < estudanteIds.length; i += 80) {
    const chunk = estudanteIds.slice(i, i + 80)
    const { error } = await svc.from('simulado_grupo_membros').update({ expira_em: expira }).eq('tenant_id', tenantId).eq('grupo_id', grupoId).in('estudante_id', chunk)
    if (error) return
  }
}

/**
 * Faz o Início do aluno recomputar (calendário/avisos): marca o snapshot como desatualizado.
 * `grupoId` = só os membros do grupo; null = todos do tenant. Best-effort.
 */
export async function invalidarInicioAlunos(tenantId: string, grupoId: string | null) {
  try {
    const svc = createAdminClient()
    if (!grupoId) {
      await svc.from('simulado_home_snapshot').update({ dia: '2000-01-01' }).eq('tenant_id', tenantId).neq('dia', '2000-01-01')
      return
    }
    const ms = await fetchAll<{ id: string; estudante_id: string }>(() => svc.from('simulado_grupo_membros').select('id, estudante_id').eq('tenant_id', tenantId).eq('grupo_id', grupoId).order('id', { ascending: true }))
    const ids = [...new Set(ms.map((m) => m.estudante_id))]
    for (let i = 0; i < ids.length; i += 80)
      await svc.from('simulado_home_snapshot').update({ dia: '2000-01-01' }).eq('tenant_id', tenantId).in('estudante_id', ids.slice(i, i + 80)).neq('dia', '2000-01-01')
  } catch { /* snapshot ausente → a próxima leitura já computa */ }
}

/** Destinatários de uma campanha: SQL único e DISTINTO (sem dupla contagem de quem está em vários grupos). */
function filtroPublico(publico: { tipo: string; id?: string }[], canal: 'email' | 'api'): { where: string; params: unknown[] } {
  const params: unknown[] = []
  const conds: string[] = []
  if (publico.some((p) => p.tipo === 'todos')) conds.push('true')
  else {
    if (publico.some((p) => p.tipo === 'sem_acesso_7d')) conds.push(`e.ultimo_acesso_em < now() - interval '7 days'`)
    const membros = publico.filter((p) => p.tipo === 'membro' && isUuid(p.id)).map((p) => p.id as string)
    if (membros.length) { params.push(membros); conds.push(`e.id = ANY($${params.length + 1}::uuid[])`) }
    const grupos = publico.filter((p) => p.tipo === 'grupo' && isUuid(p.id)).map((p) => p.id as string)
    if (grupos.length) { params.push(grupos); conds.push(`EXISTS (SELECT 1 FROM simulado_grupo_membros m WHERE m.estudante_id = e.id AND m.tenant_id = $1 AND m.grupo_id = ANY($${params.length + 1}::uuid[]) AND (m.expira_em IS NULL OR m.expira_em > now()))`) }
  }
  const canalCond = canal === 'api' ? `e.telefone IS NOT NULL AND btrim(e.telefone) <> ''` : `e.email IS NOT NULL AND btrim(e.email) <> ''`
  return { where: `e.tenant_id = $1 AND e.deletado = false AND e.acesso_bloqueado = false AND (${conds.length ? conds.join(' OR ') : 'false'}) AND ${canalCond}`, params }
}

/** Quantos alunos DISTINTOS recebem (e-mail: com e-mail; API: com celular; sem bloqueados). */
export async function contarPublico(tenantId: string, publico: { tipo: string; id?: string }[], canal: 'email' | 'api' = 'email'): Promise<number> {
  if (!publico.length) return 0
  const f = filtroPublico(publico, canal)
  const rows = await sqlQuery<{ n: number }>(`SELECT count(*)::int AS n FROM simulado_estudantes e WHERE ${f.where}`, [tenantId, ...f.params])
  if (rows && rows[0]) return Number(rows[0].n) || 0
  return contarPublicoAprox(tenantId, publico)
}

export type Destinatario = { id: string; nome: string; email: string | null; telefone: string | null }

/** Página de destinatários (keyset por id) — usada pelo envio real. */
export async function destinatariosCampanha(tenantId: string, publico: { tipo: string; id?: string }[], canal: 'email' | 'api', depoisDe: string | null, limite: number): Promise<Destinatario[] | null> {
  const f = filtroPublico(publico, canal)
  const p = [tenantId, ...f.params]
  let pos = ''
  if (depoisDe && isUuid(depoisDe)) { p.push(depoisDe); pos = ` AND e.id > $${p.length}::uuid` }
  return sqlQuery<Destinatario>(`SELECT e.id, e.nome, e.email, e.telefone FROM simulado_estudantes e WHERE ${f.where}${pos} ORDER BY e.id LIMIT ${Math.min(Math.max(limite, 1), 500)}`, p)
}

/** Fallback SEM SQL direto (sem DATABASE_URL): aproximação por PostgREST. */
async function contarPublicoAprox(tenantId: string, publico: { tipo: string; id?: string }[]): Promise<number> {
  const svc = createAdminClient()
  const base = () => svc.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('deletado', false).eq('acesso_bloqueado', false)
  if (publico.some((p) => p.tipo === 'todos')) return (await base()).count ?? 0
  const ids = new Set<string>()
  for (const p of publico) if (p.tipo === 'membro' && isUuid(p.id)) ids.add(p.id)
  const grupos = publico.filter((p) => p.tipo === 'grupo' && isUuid(p.id)).map((p) => p.id as string)
  if (grupos.length) {
    const ms = await fetchAllByIn<{ id: string; estudante_id: string }>(grupos, (chunk) => svc.from('simulado_grupo_membros').select('id, estudante_id').eq('tenant_id', tenantId).in('grupo_id', chunk).order('id', { ascending: true }))
    for (const m of ms) ids.add(m.estudante_id)
  }
  let sem = 0
  if (publico.some((p) => p.tipo === 'sem_acesso_7d')) sem = (await base().lt('ultimo_acesso_em', new Date(Date.now() - 7 * 86_400_000).toISOString())).count ?? 0
  return sem + ids.size
}
