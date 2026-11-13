import { createAdminClient } from '@/lib/supabase/server'
import { fetchAll } from '@/lib/supabase/fetch-all'
import { liberaEmTrilha, menorLiberacao } from '@/lib/produtos/liberacao-trilhas-calc'
import { nomesDeRecursos } from '@/lib/produtos/estudio'
import { normalizarRegra, refsDaRegra, resumoRegra } from '@/lib/segmentos/tipos'
import { semTabela } from './dados'
import type { CelulaTrilha, FiltrosGrade, LinhaGrade, SegmentoLeve, Trilha } from './tipos-trilhas'
import { sanearBusca } from '@/lib/seguranca/postgrest-safe'

// Leituras das abas "Cronogramas" e "Regras" (só LEEM; filtro/ordem/paginação no banco). Tolerantes: sem as tabelas
// da migração 20261118020000 devolvem migrado=false em vez de quebrar.

type Svc = ReturnType<typeof createAdminClient>

export const SELECT_TRILHA = 'id, nome, descricao, ordem, inicio_cronograma, offset_dias, segmento_ids, cor, ativo'
export function mapTrilha(r: any, aulasComData = 0): Trilha {
  return {
    id: r.id, nome: r.nome, descricao: r.descricao ?? null, ordem: Number(r.ordem) || 0, inicioCronograma: r.inicio_cronograma ?? null,
    offsetDias: Number(r.offset_dias) || 0, segmentoIds: Array.isArray(r.segmento_ids) ? r.segmento_ids : [], cor: r.cor ?? null, ativo: r.ativo !== false, aulasComData,
  }
}

export async function listarTrilhas(svc: Svc, tenantId: string, produtoId: string): Promise<{ migrado: boolean; trilhas: Trilha[] }> {
  const { data, error } = await svc.from('simulado_liberacao_trilhas').select(SELECT_TRILHA).eq('tenant_id', tenantId).eq('produto_id', produtoId).order('ordem', { ascending: true }).order('nome', { ascending: true })
  if (semTabela(error)) return { migrado: false, trilhas: [] }
  const rows = (data ?? []) as any[]
  const contagens = await Promise.all(rows.map((r) =>
    svc.from('simulado_liberacao_trilha_aulas').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('trilha_id', r.id).not('data_cronograma', 'is', null)))
  return { migrado: true, trilhas: rows.map((r, i) => mapTrilha(r, contagens[i].count ?? 0)) }
}

const COLS_ORDEM: Record<string, string> = { ordem: 'ordem', data: 'data_liberacao', disciplina: 'disciplina', titulo: 'titulo' }

/** Uma página da grade (aulas × trilhas ATIVAS). Paginação no banco: .range() + count. */
export async function lerGrade(svc: Svc, tenantId: string, produtoId: string, trilhas: Trilha[], f: FiltrosGrade, pagina: number, porPagina: number): Promise<{ total: number; linhas: LinhaGrade[]; migrado: boolean }> {
  let q: any = svc.from('simulado_produto_liberacao_aulas').select('id, ordem, disciplina, numero_aula, titulo, data_liberacao', { count: 'exact' }).eq('tenant_id', tenantId).eq('produto_id', produtoId)
  const termo = sanearBusca(f.q ?? '')
  if (termo) q = q.or(`disciplina.ilike.%${termo}%,titulo.ilike.%${termo}%`)
  if (f.disc) q = q.eq('disciplina', f.disc)
  const col = COLS_ORDEM[f.ord ?? ''] ?? 'ordem'
  q = q.order(col, { ascending: f.dir !== 'desc', nullsFirst: false })
  if (col !== 'ordem') q = q.order('ordem', { ascending: true })
  const from = (pagina - 1) * porPagina
  const { data, count, error } = await q.range(from, from + porPagina - 1)
  if (semTabela(error)) return { total: 0, linhas: [], migrado: false }
  const rows = (data ?? []) as any[]
  const ativas = trilhas.filter((t) => t.ativo)
  const celulasPor = new Map<string, Map<string, { c: string | null; m: string | null }>>()
  if (rows.length && ativas.length) {
    const { data: cs, error: e2 } = await svc.from('simulado_liberacao_trilha_aulas').select('liberacao_aula_id, trilha_id, data_cronograma, data_manual')
      .eq('tenant_id', tenantId).in('liberacao_aula_id', rows.map((r) => r.id)).in('trilha_id', ativas.map((t) => t.id))
    if (semTabela(e2)) return { total: count ?? 0, linhas: [], migrado: false }
    for (const c of (cs ?? []) as any[]) {
      const m = celulasPor.get(c.liberacao_aula_id) ?? new Map(); m.set(c.trilha_id, { c: c.data_cronograma ?? null, m: c.data_manual ?? null }); celulasPor.set(c.liberacao_aula_id, m)
    }
  }
  const linhas: LinhaGrade[] = rows.map((r) => {
    const celulas: Record<string, CelulaTrilha> = {}
    const datas = []
    for (const t of ativas) {
      const x = celulasPor.get(r.id)?.get(t.id)
      const base = { data_cronograma: x?.c ?? null, data_manual: x?.m ?? null, offset_dias: t.offsetDias }
      celulas[t.id] = { dataCronograma: base.data_cronograma, dataManual: base.data_manual, efetiva: liberaEmTrilha(base) }
      datas.push(base)
    }
    return { id: r.id, ordem: r.ordem, disciplina: r.disciplina, numeroAula: r.numero_aula ?? null, titulo: r.titulo, dataBase: r.data_liberacao, menor: menorLiberacao(datas), celulas }
  })
  return { total: count ?? 0, linhas, migrado: true }
}

/** Todas as linhas do filtro (exportação). */
export async function lerGradeCompleta(svc: Svc, tenantId: string, produtoId: string, trilhas: Trilha[], f: FiltrosGrade): Promise<LinhaGrade[]> {
  const out: LinhaGrade[] = []
  for (let pag = 1; pag <= 50; pag++) {
    const r = await lerGrade(svc, tenantId, produtoId, trilhas, f, pag, 100)
    out.push(...r.linhas)
    if (!r.linhas.length || out.length >= r.total) break
  }
  return out
}

/** Segmentos do tenant (leves) com o resumo textual da condição + nomes dos grupos/produtos/simulados citados. */
export async function listarSegmentosLeves(svc: Svc, tenantId: string): Promise<{ segmentos: SegmentoLeve[]; nomes: Record<string, string> }> {
  const { data, error } = await svc.from('simulado_segmentos').select('id, nome, regra').eq('tenant_id', tenantId).eq('deletado', false).order('nome', { ascending: true }).limit(500)
  if (error) return { segmentos: [], nomes: {} }
  const rows = ((data ?? []) as any[]).map((s) => ({ id: s.id as string, nome: s.nome as string, regra: normalizarRegra(s.regra) }))
  const ids: Record<'grupo' | 'produto' | 'simulado', Set<string>> = { grupo: new Set(), produto: new Set(), simulado: new Set() }
  for (const r of rows) { const x = refsDaRegra(r.regra); for (const k of ['grupo', 'produto', 'simulado'] as const) x[k].forEach((i) => ids[k].add(i)) }
  const nomes: Record<string, string> = {}
  const [g, s] = await Promise.all([nomesDeRecursos(tenantId, 'grupo', [...ids.grupo]), nomesDeRecursos(tenantId, 'simulado', [...ids.simulado])])
  for (const m of [g, s]) for (const v of Object.values(m)) nomes[v.id] = v.nome
  if (ids.produto.size) {
    const { data: ps } = await svc.from('simulado_produtos').select('id, nome').eq('tenant_id', tenantId).in('id', [...ids.produto].slice(0, 200))
    for (const p of (ps ?? []) as any[]) nomes[p.id] = p.nome
  }
  return { segmentos: rows.map((r) => ({ id: r.id, nome: r.nome, resumo: resumoRegra(r.regra, nomes), regra: r.regra })), nomes }
}

/** Todas as linhas de trilha_aulas das trilhas dadas (recálculo da data-base). */
export async function lerTodasCelulas(svc: Svc, tenantId: string, trilhaIds: string[]) {
  if (!trilhaIds.length) return [] as Array<{ liberacao_aula_id: string; trilha_id: string; data_cronograma: string | null; data_manual: string | null }>
  return fetchAll<{ liberacao_aula_id: string; trilha_id: string; data_cronograma: string | null; data_manual: string | null; id: string }>(() =>
    svc.from('simulado_liberacao_trilha_aulas').select('id, liberacao_aula_id, trilha_id, data_cronograma, data_manual').eq('tenant_id', tenantId).in('trilha_id', trilhaIds).order('id', { ascending: true }) as any)
}
