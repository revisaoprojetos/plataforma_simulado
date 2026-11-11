import type { SupabaseClient } from '@supabase/supabase-js'
import type { EstadoAtual } from '@/app/admin/cronogramas/importar/actions-tipos'
import { limparBusca, norm, ordenarPor, paginarMemoria } from './comum-ger3'

// Sub-aba "Importação" do Gerador: histórico (auditoria) paginado no servidor + catálogo atual paginado em memória.

export const ENTIDADES_IMPORTACAO = ['simulado_cronograma_metas', 'simulado_cronograma_links'] as const
export interface LinhaHistorico {
  id: string; criadoEm: string; operacao: string; entidade: string; ator: string; resumo: string
}
export interface PaginaHistorico { itens: LinhaHistorico[]; total: number; pagina: number; porPagina: number }

const COLUNA_ORDEM: Record<string, string> = { quando: 'criado_em', op: 'operacao', tipo: 'entidade' }
const isUuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

function resumir(entidade: string, d: Record<string, unknown> | null): string {
  if (!d) return '—'
  if (entidade === 'simulado_cronograma_metas') {
    const nome = String(d.cronograma_nome ?? 'Cronograma')
    return `${nome}: ${Number(d.importadas ?? 0).toLocaleString('pt-BR')} meta(s) gravadas, ${Number(d.removidas ?? 0).toLocaleString('pt-BR')} substituídas`
  }
  const plat = Array.isArray(d.plataformas_criadas) ? (d.plataformas_criadas as unknown[]).length : 0
  return `${Number(d.aulas ?? 0).toLocaleString('pt-BR')} aula(s) com link, ${Number(d.links ?? 0).toLocaleString('pt-BR')} link(s)${plat ? `, ${plat} plataforma(s) nova(s)` : ''}`
}

/** Histórico de importações = eventos de auditoria das duas entidades gravadas pelo fluxo de importar. `.range()` + count. */
export async function listarHistoricoImportacao(svc: SupabaseClient, tenantId: string, o: {
  q?: string; op?: string; tipo?: string; ordem?: string; dir: 'asc' | 'desc'; pagina: number; porPagina: number
}): Promise<PaginaHistorico> {
  const entidades = o.tipo === 'metas' ? [ENTIDADES_IMPORTACAO[0]] : o.tipo === 'links' ? [ENTIDADES_IMPORTACAO[1]] : [...ENTIDADES_IMPORTACAO]
  const col = COLUNA_ORDEM[o.ordem ?? ''] ?? 'criado_em'
  const dirEf = o.ordem ? o.dir : 'desc'
  const de = (o.pagina - 1) * o.porPagina
  let qb = svc.from('simulado_audit_logs')
    .select('id, criado_em, operacao, entidade, actor_user_id, ator_id, dados_novos', { count: 'exact' })
    .eq('tenant_id', tenantId).in('entidade', entidades)
  if (o.op === 'INSERT' || o.op === 'UPDATE') qb = qb.eq('operacao', o.op)
  const q = limparBusca(o.q)
  if (q) qb = qb.ilike('dados_novos->>cronograma_nome', `%${q}%`)
  const { data, count, error } = await qb.order(col, { ascending: dirEf === 'asc' }).order('id', { ascending: true }).range(de, de + o.porPagina - 1)
  if (error) throw error
  const rows = (data ?? []) as Array<{ id: string; criado_em: string; operacao: string; entidade: string; actor_user_id: string | null; ator_id: string | null; dados_novos: Record<string, unknown> | null }>

  const atorIds = [...new Set(rows.map((r) => r.actor_user_id ?? r.ator_id).filter(isUuid))]
  const nomes = new Map<string, string>()
  await Promise.all(atorIds.map(async (uid) => {
    try {
      const { data: u } = await svc.auth.admin.getUserById(uid)
      if (u?.user) nomes.set(uid, ((u.user.user_metadata as { nome?: string } | null)?.nome) || u.user.email || '')
    } catch { /* ator removido: cai no rótulo genérico */ }
  }))
  return {
    total: count ?? 0, pagina: o.pagina, porPagina: o.porPagina,
    itens: rows.map((r) => ({
      id: r.id, criadoEm: r.criado_em, operacao: r.operacao, entidade: r.entidade,
      ator: nomes.get((r.actor_user_id ?? r.ator_id) as string) || 'Sistema',
      resumo: resumir(r.entidade, r.dados_novos),
    })),
  }
}

/** Catálogo atual (já carregado pelo fluxo de importar) filtrado/ordenado/paginado no servidor. */
export function paginarCatalogoImportacao(cron: EstadoAtual['cronogramas'], o: { q?: string; status?: string; ordem?: string; dir: 'asc' | 'desc'; pagina: number; porPagina: number }) {
  const q = norm(o.q ?? '')
  let l = cron.filter((c) => (!q || norm(`${c.nome} ${c.slug}`).includes(q)) && (!o.status || c.status === o.status))
  const chave: Record<string, (c: (typeof cron)[number]) => string | number> = { nome: (c) => c.nome, slug: (c) => c.slug, metas: (c) => c.metas, status: (c) => c.status }
  l = ordenarPor(l, chave[o.ordem ?? ''] ?? chave.nome, o.ordem ? o.dir : 'asc')
  return paginarMemoria(l, o.pagina, o.porPagina)
}
