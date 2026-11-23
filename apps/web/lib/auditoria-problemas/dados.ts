// Leitura da Auditoria de Problemas (servidor). Tudo agregado/paginado no banco; a página só LÊ.
// Tolerante: sem a migração 20261124000000 devolve `migrado:false` (a tela mostra o aviso).
import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { hojeBrtISO } from '@/lib/brt'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'
import {
  AREAS, STATUS, PRIORIDADES,
  type Problema, type Resumo, type HistoricoItem, type FiltrosProblemas,
} from './tipos'

type Svc = ReturnType<typeof createAdminClient>

export const MSG_MIGRACAO = 'A Auditoria de Problemas ainda não foi ativada neste banco. Aplique a migração 20261124000000_auditoria_problemas.sql.'

export function semTabela(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false
  const m = String(err.message ?? '')
  return err.code === '42P01' || err.code === 'PGRST205' || err.code === 'PGRST204' || err.code === 'PGRST202' || err.code === '42883' || /schema cache|does not exist/i.test(m)
}

const COLS = 'id, area, assunto, razao, acao, status, prioridade, prazo, prazo_texto, data_registro, versao, relator, responsavel, origem, atualizado_em'
const ORDENAVEIS: Record<string, string> = {
  assunto: 'assunto', area: 'area', status: 'status', prioridade: 'prioridade_ord', prazo: 'prazo',
  responsavel: 'responsavel', data_registro: 'data_registro', atualizado_em: 'atualizado_em',
}

function somaDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Aplica os filtros da lista (mesma regra para tabela e exportação). */
function filtrar<Q extends { eq: Function; or: Function; lt: Function; gte: Function; lte: Function; is: Function; neq: Function }>(q: Q, f: FiltrosProblemas): Q {
  let r: any = q
  if ((AREAS as readonly string[]).includes(f.area ?? '')) r = r.eq('area', f.area)
  if ((STATUS as readonly string[]).includes(f.status ?? '')) r = r.eq('status', f.status)
  if ((PRIORIDADES as readonly string[]).includes(f.prioridade ?? '')) r = r.eq('prioridade', f.prioridade)
  const resp = sanearBusca(f.responsavel ?? '', 80)
  if (resp) r = r.ilike('responsavel', `%${resp}%`)
  const busca = sanearBusca(f.q ?? '', 80)
  if (busca) r = r.or(['assunto', 'razao', 'acao', 'relator', 'responsavel', 'versao'].map((c) => `${c}.ilike.%${busca}%`).join(','))
  const hoje = hojeBrtISO()
  if (f.prazo === 'atrasado') r = r.neq('status', 'resolvido').lt('prazo', hoje)
  else if (f.prazo === '7d') r = r.neq('status', 'resolvido').gte('prazo', hoje).lte('prazo', somaDias(hoje, 7))
  else if (f.prazo === '30d') r = r.neq('status', 'resolvido').gte('prazo', hoje).lte('prazo', somaDias(hoje, 30))
  else if (f.prazo === 'sem') r = r.is('prazo', null)
  return r
}

function paraProblema(row: any, hoje: string): Problema {
  return { ...row, atrasado: row.status !== 'resolvido' && !!row.prazo && row.prazo < hoje } as Problema
}

export type ListaProblemas = { migrado: boolean; total: number; linhas: Problema[] }

export async function listarProblemas(
  tenantId: string, f: FiltrosProblemas,
  o: { page: number; pp: number; sort?: string; dir?: 'asc' | 'desc' },
): Promise<ListaProblemas> {
  const svc: Svc = createAdminClient()
  const from = (o.page - 1) * o.pp
  const col = ORDENAVEIS[o.sort ?? ''] ?? 'atualizado_em'
  const base = svc.from('auditoria_problemas').select(COLS, { count: 'exact' }).eq('tenant_id', tenantId).is('deleted_at', null)
  const { data, count, error } = await filtrar(base as any, f)
    .order(col, { ascending: o.dir === 'asc', nullsFirst: false })
    .order('id', { ascending: true })
    .range(from, from + o.pp - 1)
  if (semTabela(error)) return { migrado: false, total: 0, linhas: [] }
  const hoje = hojeBrtISO()
  return { migrado: true, total: count ?? 0, linhas: ((data ?? []) as any[]).map((r) => paraProblema(r, hoje)) }
}

/** Todas as linhas do filtro (exportação / mapa mental), paginadas com .range() e .order() por id. */
export async function listarTodosProblemas(tenantId: string, f: FiltrosProblemas = {}): Promise<{ migrado: boolean; linhas: Problema[] }> {
  const svc: Svc = createAdminClient()
  try {
    const rows = await fetchAll<any>(() => filtrar(
      svc.from('auditoria_problemas').select(COLS).eq('tenant_id', tenantId).is('deleted_at', null) as any, f,
    ).order('area', { ascending: true }).order('id', { ascending: true }) as any)
    const hoje = hojeBrtISO()
    return { migrado: true, linhas: rows.map((r) => paraProblema(r, hoje)) }
  } catch (e: any) {
    if (semTabela(e)) return { migrado: false, linhas: [] }
    throw e
  }
}

const RESUMO_VAZIO: Resumo = { total: 0, abertos: 0, em_andamento: 0, resolvidos: 0, atrasados: 0, resolvidos_30d: 0, por_area: [], por_prioridade: [], proximos: [] }

/** KPIs e distribuições vindos de UMA função SQL (auditoria_problemas_resumo). */
export async function resumoProblemas(tenantId: string): Promise<{ migrado: boolean; resumo: Resumo }> {
  const { data, error } = await createAdminClient().rpc('auditoria_problemas_resumo', { p_tenant: tenantId, p_hoje: hojeBrtISO() })
  if (semTabela(error)) return { migrado: false, resumo: RESUMO_VAZIO }
  return { migrado: true, resumo: { ...RESUMO_VAZIO, ...((data ?? {}) as Partial<Resumo>) } }
}

/** Histórico geral do tenant (paginado) ou de um problema; resolve o nome do ator em lote (chunk 80). */
export async function listarHistorico(
  tenantId: string, o: { page: number; pp: number; problemaId?: string },
): Promise<{ migrado: boolean; total: number; linhas: HistoricoItem[] }> {
  const svc: Svc = createAdminClient()
  const from = (o.page - 1) * o.pp
  let q = svc.from('auditoria_problemas_historico').select('id, problema_id, ator_id, acao, antes, depois, criado_em', { count: 'exact' }).eq('tenant_id', tenantId)
  if (o.problemaId) q = q.eq('problema_id', o.problemaId)
  const { data, count, error } = await q.order('criado_em', { ascending: false }).order('id', { ascending: true }).range(from, from + o.pp - 1)
  if (semTabela(error)) return { migrado: false, total: 0, linhas: [] }
  const rows = (data ?? []) as any[]

  const probIds = [...new Set(rows.map((r) => r.problema_id as string))]
  const atorIds = [...new Set(rows.map((r) => r.ator_id as string | null).filter(Boolean) as string[])]
  const assuntos = new Map<string, string>()
  const atores = new Map<string, string>()
  for (let i = 0; i < probIds.length; i += 80) {
    const { data: ps } = await svc.from('auditoria_problemas').select('id, assunto').eq('tenant_id', tenantId).in('id', probIds.slice(i, i + 80))
    for (const p of (ps ?? []) as any[]) assuntos.set(p.id, p.assunto)
  }
  // Nome do ator: administradores do tenant (simulado_estudantes não serve — ator é admin). Falha → mostra só o e-mail/id curto.
  for (let i = 0; i < atorIds.length; i += 80) {
    const { data: us } = await svc.from('simulado_users').select('id, nome, email').in('id', atorIds.slice(i, i + 80))
    for (const u of (us ?? []) as any[]) atores.set(u.id, u.nome || u.email || String(u.id).slice(0, 8))
  }
  return {
    migrado: true, total: count ?? 0,
    linhas: rows.map((r) => ({
      id: r.id, problema_id: r.problema_id, assunto: assuntos.get(r.problema_id) ?? null,
      ator: r.ator_id ? atores.get(r.ator_id) ?? String(r.ator_id).slice(0, 8) : 'Sistema',
      acao: r.acao, antes: r.antes, depois: r.depois, criado_em: r.criado_em,
    })),
  }
}
