import { createAdminClient } from '@/lib/supabase/server'
import { CATEGORIAS, SEVERIDADES, STATUS_ACHADO } from './tipos'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'

/** Leitura (servidor) para /admin/seguranca. Tudo paginado com .range()+count; a page só LÊ. */

export interface AchadoLinha {
  id: string; categoria: string; severidade: string; titulo: string; detalhe: string | null; arquivo: string | null
  recomendacao: string | null; status: string; motivo_status: string | null; primeira_vez: string; ultima_vez: string; origem: string
}

const SORTS = ['severidade_peso', 'titulo', 'categoria', 'status', 'primeira_vez', 'ultima_vez']
/** Remove caracteres que quebram filtros PostgREST .or() (, ( ) " \ %). */
export const limparBusca = (q: string) => sanearBusca(q, 80)

export async function resumoGeral() {
  const svc = createAdminClient()
  const contar = (sev: string) => svc.from('seguranca_achados').select('id', { count: 'exact', head: true }).eq('status', 'aberto').eq('severidade', sev)
  const [c, a, m, b, ultimas, naoLidas, atualizacoes] = await Promise.all([
    contar('critico'), contar('alto'), contar('medio'), contar('baixo'),
    svc.from('seguranca_varreduras').select('id, origem, iniciado_em, finalizado_em, total_achados, criticos, altos, medios, baixos').order('iniciado_em', { ascending: false }).limit(14),
    svc.from('seguranca_notificacoes').select('id', { count: 'exact', head: true }).eq('lida', false),
    svc.from('seguranca_atualizacoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente'),
  ])
  return {
    criticos: c.count ?? 0, altos: a.count ?? 0, medios: m.count ?? 0, baixos: b.count ?? 0,
    varreduras: (ultimas.data ?? []) as any[], naoLidas: naoLidas.count ?? 0, atualizacoesPendentes: atualizacoes.count ?? 0,
  }
}

export async function listarAchados(p: { page: number; pp: number; sort: string; dir: 'asc' | 'desc'; q: string; categoria?: string; severidade?: string; status?: string }) {
  const svc = createAdminClient()
  let query = svc.from('seguranca_achados')
    .select('id, categoria, severidade, titulo, detalhe, arquivo, recomendacao, status, motivo_status, primeira_vez, ultima_vez, origem', { count: 'exact' })
  if (p.categoria && (CATEGORIAS as readonly string[]).includes(p.categoria)) query = query.eq('categoria', p.categoria)
  if (p.severidade && (SEVERIDADES as readonly string[]).includes(p.severidade)) query = query.eq('severidade', p.severidade)
  // Padrão: abertos. "todos" lista tudo.
  const status = p.status ?? 'aberto'
  if ((STATUS_ACHADO as readonly string[]).includes(status)) query = query.eq('status', status)
  const q = limparBusca(p.q)
  if (q) query = query.or(`titulo.ilike.%${q}%,arquivo.ilike.%${q}%,detalhe.ilike.%${q}%`)
  const sort = SORTS.includes(p.sort) ? p.sort : 'severidade_peso'
  // severidade_peso = coluna gerada (crítico=4 … baixo=1); desempate por ultima_vez e id (coluna ÚNICA).
  query = query.order(sort, { ascending: p.dir === 'asc' })
  if (sort === 'severidade_peso') query = query.order('ultima_vez', { ascending: false })
  query = query.order('id', { ascending: true })
  const { data, count } = await query.range((p.page - 1) * p.pp, p.page * p.pp - 1)
  return { rows: (data ?? []) as AchadoLinha[], total: count ?? 0 }
}

export async function listarVarreduras(page: number, pp: number) {
  const { data, count } = await createAdminClient().from('seguranca_varreduras')
    .select('id, origem, iniciado_em, finalizado_em, total_achados, criticos, altos, medios, baixos, resumo', { count: 'exact' })
    .order('iniciado_em', { ascending: false }).range((page - 1) * pp, page * pp - 1)
  const rows = (data ?? []).map((v: any) => ({
    ...v, novos: v.resumo?.novos?.length ?? 0, resolvidos: v.resumo?.resolvidos?.length ?? 0, erros: v.resumo?.erros?.length ?? 0, resumo: undefined,
  }))
  return { rows: rows as any[], total: count ?? 0 }
}

export async function detalheVarredura(id: string) {
  const svc = createAdminClient()
  const { data: v } = await svc.from('seguranca_varreduras').select('*').eq('id', id).maybeSingle()
  if (!v) return null
  const r = v.resumo ?? {}
  const titulos = async (fps: string[]) => {
    const out: { fingerprint: string; titulo: string; severidade: string; categoria: string }[] = []
    for (let i = 0; i < Math.min(fps.length, 400); i += 80) {
      const { data } = await svc.from('seguranca_achados').select('fingerprint, titulo, severidade, categoria').in('fingerprint', fps.slice(i, i + 80))
      out.push(...((data ?? []) as any[]))
    }
    return out
  }
  const [novos, resolvidos] = await Promise.all([titulos([...(r.novos ?? []), ...(r.reabertos ?? [])]), titulos(r.resolvidos ?? [])])
  const persistentes = (r.atual ?? []).filter((a: any) => (r.persistentes ?? []).includes(a.fp)).map((a: any) => ({ fingerprint: a.fp, titulo: a.titulo, severidade: a.sev }))
  const fps = (r.atual ?? []).map((a: any) => a.fp).filter(Boolean) as string[]
  return { varredura: v, novos, resolvidos, persistentes, erros: (r.erros ?? []) as string[], fps }
}

export interface AtualizacaoLinha { id: string; pacote: string; versao_atual: string | null; versao_alvo: string | null; tipo: 'patch' | 'minor' | 'major'; cve_ids: string[]; severidade: string; detectado_em: string }

export async function listarAtualizacoes(p: { page: number; pp: number; sort: string; dir: 'asc' | 'desc'; q: string; tipo?: string; cve?: boolean }) {
  const svc = createAdminClient()
  let query = svc.from('seguranca_atualizacoes').select('id, pacote, versao_atual, versao_alvo, tipo, cve_ids, severidade, detectado_em', { count: 'exact' }).eq('status', 'pendente')
  if (p.tipo === 'patch' || p.tipo === 'minor' || p.tipo === 'major') query = query.eq('tipo', p.tipo)
  if (p.cve) query = query.neq('cve_ids', '{}')
  const q = limparBusca(p.q)
  if (q) query = query.ilike('pacote', `%${q}%`)
  const sort = ['pacote', 'tipo', 'detectado_em', 'severidade'].includes(p.sort) ? p.sort : 'detectado_em'
  const { data, count } = await query.order(sort, { ascending: p.dir === 'asc' }).order('id', { ascending: true }).range((p.page - 1) * p.pp, p.page * p.pp - 1)
  return { rows: (data ?? []) as AtualizacaoLinha[], total: count ?? 0 }
}

export async function contagemAtualizacoes() {
  const svc = createAdminClient()
  const c = (tipo: string) => svc.from('seguranca_atualizacoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente').eq('tipo', tipo)
  const [pa, mi, ma, cv] = await Promise.all([c('patch'), c('minor'), c('major'), svc.from('seguranca_atualizacoes').select('id', { count: 'exact', head: true }).eq('status', 'pendente').neq('cve_ids', '{}')])
  return { patch: pa.count ?? 0, minor: mi.count ?? 0, major: ma.count ?? 0, comCve: cv.count ?? 0 }
}
