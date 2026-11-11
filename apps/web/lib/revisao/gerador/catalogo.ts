import 'server-only'
/**
 * Leitura paginada do CATÁLOGO de cronogramas (sub-aba "catálogo" do gerador, área Revisão).
 * Só LEITURA — as mutações continuam nas actions de app/admin/cronogramas/actions.ts.
 *
 * Caminho SQL: busca/status/divisão/carga/ordenação por coluna → `.range()` + `count: 'exact'`.
 * Caminho em memória (no SERVIDOR): filtros "sem pacote/sem metas/invisíveis" e ordenação por
 * metas/pacotes, que dependem das contagens agregadas (RPC) — o catálogo tem dezenas/centenas de linhas.
 */
import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/auth/permissions'
import { faixaSemanal } from '@/lib/cronograma/faixa'
import type { CronogramaLista } from '@/app/admin/cronogramas/actions-tipos'

export type StatusFiltro = 'todos' | 'liberados' | 'rascunhos' | 'sem_pacote' | 'sem_metas' | 'invisiveis'
export const ORDS_CATALOGO = ['padrao', 'nome', 'carga', 'semanas', 'status', 'metas', 'pacotes'] as const
export type OrdCatalogo = (typeof ORDS_CATALOGO)[number]

export interface ParamsCatalogo {
  q: string
  status: StatusFiltro
  cat: string // '' | 'sem' | uuid
  carga: number | null
  ord: OrdCatalogo
  dir: 'asc' | 'desc'
  pag: number
  pps: number
}

export interface ResultadoCatalogo {
  ok: boolean
  error?: string
  itens: CronogramaLista[]
  total: number
  kpis: { todos: number; liberados: number; rascunhos: number; semPacote: number; semMetas: number; invisiveis: number }
  cargas: number[]
}

const COLS = 'id, slug, nome, carga_horaria, total_semanas, dias_curso, dias_nome, semanas_revisao, categoria_id, status, ordem'
const COL_ORD: Record<string, string> = { nome: 'nome', carga: 'carga_horaria', semanas: 'total_semanas', status: 'status' }

/** Busca TODAS as linhas (PostgREST corta em 1.000) paginando por coluna única. */
async function buscarTodas(montar: () => any): Promise<any[]> {
  const out: any[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await montar().order('id').range(de, de + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return out
}

export async function carregarCatalogo(tenantId: string, p: ParamsCatalogo): Promise<ResultadoCatalogo> {
  const vazio: ResultadoCatalogo = { ok: false, itens: [], total: 0, kpis: { todos: 0, liberados: 0, rascunhos: 0, semPacote: 0, semMetas: 0, invisiveis: 0 }, cargas: [] }
  if (!(await checkPermission('cronogramas:view'))) return { ...vazio, error: 'Sem permissão.' }
  const svc = createAdminClient()

  try {
    const [rpcMetas, rpcPac, leves] = await Promise.all([
      svc.rpc('simulado_cronograma_contar_metas', { p_tenant: tenantId }),
      svc.rpc('simulado_cronograma_contar_pacotes', { p_tenant: tenantId }),
      buscarTodas(() => svc.from('simulado_cronogramas').select('id, status, carga_horaria').eq('tenant_id', tenantId).eq('deletado', false)),
    ])
    const metas = new Map<string, number>()
    for (const m of ((rpcMetas.data ?? []) as any[])) metas.set(m.cronograma_id, Number(m.total))
    const pacotes = new Map<string, number>()
    for (const m of ((rpcPac.data ?? []) as any[])) pacotes.set(m.cronograma_id, Number(m.total))

    const kpis = { ...vazio.kpis, todos: leves.length }
    const setCargas = new Set<number>()
    for (const l of leves) {
      setCargas.add(Number(l.carga_horaria))
      const lib = l.status === 'liberado'
      if (lib) kpis.liberados++; else kpis.rascunhos++
      if (!(pacotes.get(l.id))) { kpis.semPacote++; if (lib) kpis.invisiveis++ }
      if (!(metas.get(l.id))) kpis.semMetas++
    }

    const { data: cats } = await svc.from('simulado_cronograma_categorias').select('id, nome').eq('tenant_id', tenantId)
    const nomeCat = new Map(((cats ?? []) as any[]).map((c) => [c.id as string, c.nome as string]))

    const filtrar = (qb: any) => {
      qb = qb.eq('tenant_id', tenantId).eq('deletado', false)
      if (p.status === 'liberados') qb = qb.eq('status', 'liberado')
      else if (p.status === 'rascunhos') qb = qb.neq('status', 'liberado')
      if (p.carga != null) qb = qb.eq('carga_horaria', p.carga)
      if (p.cat === 'sem') qb = qb.is('categoria_id', null)
      else if (p.cat) qb = qb.eq('categoria_id', p.cat)
      for (const t of p.q.toLowerCase().split(/\s+/).filter(Boolean)) qb = qb.ilike('nome', `%${t.replace(/[%_,()]/g, ' ')}%`)
      return qb
    }
    const montar = (c: any): CronogramaLista => ({
      ...c,
      categoria_nome: c.categoria_id ? (nomeCat.get(c.categoria_id) ?? null) : null,
      dias_curso: c.dias_curso ?? [],
      dias_nome: c.dias_nome ?? [],
      semanas_revisao: c.semanas_revisao ?? [],
      carga_horaria: Number(c.carga_horaria),
      faixa: faixaSemanal(c.dias_curso ?? []),
      metas: metas.get(c.id) ?? 0,
      pacotes: pacotes.get(c.id) ?? 0,
    })

    const memoria = p.status === 'sem_pacote' || p.status === 'sem_metas' || p.status === 'invisiveis' || p.ord === 'metas' || p.ord === 'pacotes'
    const asc = p.dir !== 'desc'
    const de = (p.pag - 1) * p.pps

    if (!memoria) {
      let qb = filtrar(svc.from('simulado_cronogramas').select(COLS, { count: 'exact' }))
      const col = COL_ORD[p.ord]
      if (col) qb = qb.order(col, { ascending: asc })
      else { qb = qb.order('ordem').order('carga_horaria').order('nome') }
      const { data, count, error } = await qb.order('id').range(de, de + p.pps - 1)
      if (error) return { ...vazio, error: error.message }
      return { ok: true, itens: (data ?? []).map(montar), total: count ?? 0, kpis, cargas: [...setCargas].sort((a, b) => a - b) }
    }

    const todas = (await buscarTodas(() => filtrar(svc.from('simulado_cronogramas').select(COLS)))).map(montar)
    let xs = todas
    if (p.status === 'sem_pacote') xs = xs.filter((c) => c.pacotes === 0)
    else if (p.status === 'sem_metas') xs = xs.filter((c) => c.metas === 0)
    else if (p.status === 'invisiveis') xs = xs.filter((c) => c.status === 'liberado' && c.pacotes === 0)
    const chave = (c: CronogramaLista): number | string =>
      p.ord === 'metas' ? c.metas : p.ord === 'pacotes' ? c.pacotes : p.ord === 'nome' ? c.nome : p.ord === 'carga' ? c.carga_horaria : p.ord === 'semanas' ? c.total_semanas : p.ord === 'status' ? c.status : c.ordem
    xs = [...xs].sort((a, b) => {
      const x = chave(a), y = chave(b)
      const r = typeof x === 'string' ? x.localeCompare(y as string, 'pt-BR') : (x as number) - (y as number)
      return (asc ? r : -r) || a.carga_horaria - b.carga_horaria || a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id)
    })
    return { ok: true, itens: xs.slice(de, de + p.pps), total: xs.length, kpis, cargas: [...setCargas].sort((a, b) => a - b) }
  } catch (e) {
    return { ...vazio, error: e instanceof Error ? e.message : 'Falha ao carregar o catálogo.' }
  }
}
