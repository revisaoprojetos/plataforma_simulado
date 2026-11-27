import 'server-only'

// NÚCLEO das facetas de questões (contagem por opção de cada filtro), compartilhado entre o Banco do ALUNO e o do ADMIN.
// Faceta = cada dimensão é contada com TODOS os OUTROS filtros aplicados (padrão e-commerce): o número ao lado da opção é
// "quantas questões você teria se marcasse esta". 1 GROUP BY por dimensão, em paralelo. Nada é calculado no cliente.
// O ESCOPO entra pelo `base`: o aluno passa só publicadas/não anuladas/objetivas; o admin passa todos os status (sem o filtro fixo).

import { sqlQuery } from '@/lib/data/sql'
import { COL_ADMIN, DIMS_ADMIN, FAMILIA_ADMIN, condicoesFiltros, type DimAdmin } from './questoes-sql'

export type BaseFaceta = { sql: string; params: unknown[] }
export type ContagensFaceta<D extends DimAdmin = DimAdmin> = Record<D, Record<string, number>>

/**
 * @param base WHERE já montado (tabela `simulado_questoes q`; tenant SEMPRE em $1) + seus params — escopo/visão/busca/árvore.
 * @param sel  seleção atual por dimensão ("a|b" ou array).
 * @param dims dimensões a contar (o aluno não tem status/tipo/etiqueta).
 */
export async function calcularFacetasCore<D extends DimAdmin>(base: BaseFaceta, sel: Partial<Record<DimAdmin, string[] | string>>, dims: readonly D[]): Promise<{ total: number; contagens: ContagensFaceta<D> } | null> {
  const montar = (ignorar: DimAdmin[]) => {
    const params = [...base.params]
    const add = (v: unknown) => { params.push(v); return `$${params.length}` }
    const w = [base.sql, ...condicoesFiltros(sel, add, ignorar)]
    return { where: w.filter(Boolean).join(' and '), params }
  }
  const total = montar([])
  const [tot, ...porDim] = await Promise.all([
    sqlQuery<{ n: number }>(`select count(*)::int as n from simulado_questoes q where ${total.where}`, total.params),
    ...dims.map((d) => {
      const q = montar(FAMILIA_ADMIN[d])
      const sql = d === 'etiqueta'
        ? `select et.etiqueta_id::text as v, count(*)::int as n from simulado_questoes q join simulado_questao_etiquetas et on et.questao_id = q.id where ${q.where} group by 1`
        : `select ${COL_ADMIN[d as Exclude<DimAdmin, 'etiqueta'>]} as v, count(*)::int as n from simulado_questoes q where ${q.where} group by 1`
      return sqlQuery<{ v: string | null; n: number }>(sql, q.params)
    }),
  ])
  if (!tot) return null
  const contagens = {} as ContagensFaceta<D>
  dims.forEach((d, i) => {
    const m: Record<string, number> = {}
    for (const r of porDim[i] ?? []) if (r.v) m[r.v] = Number(r.n)
    contagens[d] = m
  })
  return { total: Number(tot[0]?.n ?? 0), contagens }
}

export { DIMS_ADMIN }
