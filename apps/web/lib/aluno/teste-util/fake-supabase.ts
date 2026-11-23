// Util de TESTE (não importado pelo app): mini "Supabase" em memória com a parte do query builder que as rotas do Caderno usam.
// Registra TODAS as consultas (tabela, operação, filtros eq, payload) para os testes de isolamento tenant+estudante.
import { randomUUID } from 'crypto'

export type Linha = Record<string, any>
export interface ChamadaDb { table: string; op: 'select' | 'insert' | 'update' | 'delete' | 'upsert'; eq: Record<string, unknown>; payload?: Linha | Linha[] }
export interface ChamadaRpc { nome: string; params: Record<string, unknown> }

type Resultado = { data: any; error: any; count?: number | null }

export class FakeDb {
  tabelas: Record<string, Linha[]> = {}
  calls: ChamadaDb[] = []
  rpcCalls: ChamadaRpc[] = []
  /** RPCs disponíveis; ausente => erro PGRST202 (função não existe => o código cai no caminho antigo). */
  rpcs: Record<string, (params: Record<string, unknown>) => { data?: any; error?: any }> = {}
  /** violação de unicidade simulada: devolve true se `nova` conflita com alguma linha de `rows`. */
  unicos: Record<string, (nova: Linha, rows: Linha[]) => boolean> = {}

  /** Insere linhas (id uuid automático, versao=1, nivel=0 se omitidos) e devolve as linhas criadas. */
  seed(tabela: string, ...rows: Linha[]): Linha[] {
    this.tabelas[tabela] ??= []
    const out = rows.map((r) => ({ id: randomUUID(), versao: 1, ...r }))
    this.tabelas[tabela].push(...out)
    return out
  }
  rows(tabela: string): Linha[] { return (this.tabelas[tabela] ??= []) }
  reset() { this.calls = []; this.rpcCalls = [] }

  from(table: string) { return new Builder(this, table) }
  rpc(nome: string, params: Record<string, unknown> = {}) {
    this.rpcCalls.push({ nome, params })
    const fn = this.rpcs[nome]
    const r = fn ? fn(params) : { error: { code: 'PGRST202', message: `Could not find the function public.${nome}` } }
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null })
  }
}

const cmp = (a: any, b: any) => (a < b ? -1 : a > b ? 1 : 0)

class Builder implements PromiseLike<Resultado> {
  private op: ChamadaDb['op'] = 'select'
  private payload: Linha | Linha[] | undefined
  private filtros: ((r: Linha) => boolean)[] = []
  private eqs: Record<string, unknown> = {}
  private ordens: { col: string; asc: boolean }[] = []
  private lim: number | null = null
  private rng: [number, number] | null = null
  private head = false
  private contar = false
  private unico: 'maybe' | 'single' | null = null
  private retornar = false
  constructor(private db: FakeDb, private table: string) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === 'select') { this.head = !!opts?.head; this.contar = !!opts?.count } else this.retornar = true
    return this
  }
  insert(p: Linha | Linha[]) { this.op = 'insert'; this.payload = p; return this }
  upsert(p: Linha | Linha[]) { this.op = 'upsert'; this.payload = p; return this }
  update(p: Linha) { this.op = 'update'; this.payload = p; return this }
  delete() { this.op = 'delete'; return this }

  eq(c: string, v: unknown) { this.eqs[c] = v; this.filtros.push((r) => r[c] === v); return this }
  neq(c: string, v: unknown) { this.filtros.push((r) => r[c] !== v); return this }
  is(c: string, v: unknown) { this.filtros.push((r) => (v === null ? r[c] === null || r[c] === undefined : r[c] === v)); return this }
  not(c: string, _o: string, v: unknown) { this.filtros.push((r) => (v === null ? r[c] !== null && r[c] !== undefined : r[c] !== v)); return this }
  gte(c: string, v: any) { this.filtros.push((r) => r[c] != null && r[c] >= v); return this }
  lte(c: string, v: any) { this.filtros.push((r) => r[c] != null && r[c] <= v); return this }
  lt(c: string, v: any) { this.filtros.push((r) => r[c] != null && r[c] < v); return this }
  gt(c: string, v: any) { this.filtros.push((r) => r[c] != null && r[c] > v); return this }
  in(c: string, vs: unknown[]) { this.filtros.push((r) => vs.includes(r[c])); return this }
  or(_f: string) { return this }
  textSearch(_c: string, _q: string, _o?: unknown) { return this }
  order(col: string, o?: { ascending?: boolean }) { this.ordens.push({ col, asc: o?.ascending !== false }); return this }
  limit(n: number) { this.lim = n; return this }
  range(a: number, b: number) { this.rng = [a, b]; return this }
  maybeSingle() { this.unico = 'maybe'; return this }
  single() { this.unico = 'single'; return this }

  then<A = Resultado, B = never>(ok?: ((v: Resultado) => A | PromiseLike<A>) | null, ko?: ((e: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve(this.executar()).then(ok, ko)
  }

  private executar(): Resultado {
    const rows = this.db.rows(this.table)
    this.db.calls.push({ table: this.table, op: this.op, eq: { ...this.eqs }, payload: this.payload })
    const casa = (r: Linha) => this.filtros.every((f) => f(r))

    if (this.op === 'insert' || this.op === 'upsert') {
      const novas = (Array.isArray(this.payload) ? this.payload : [this.payload as Linha]).map((p) => ({ id: randomUUID(), versao: 1, nivel: 0, ...p }))
      for (const n of novas) {
        if (this.db.unicos[this.table]?.(n, rows)) {
          if (this.op === 'upsert') return { data: null, error: null }
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
        }
        rows.push(n)
      }
      return this.finalizar(this.retornar ? novas : null, novas.length)
    }
    if (this.op === 'update') {
      const alvo = rows.filter(casa)
      for (const r of alvo) Object.assign(r, this.payload)
      return this.finalizar(this.retornar ? alvo : null, alvo.length)
    }
    if (this.op === 'delete') {
      const alvo = rows.filter(casa)
      this.db.tabelas[this.table] = rows.filter((r) => !alvo.includes(r))
      return this.finalizar(null, alvo.length)
    }
    let sel = rows.filter(casa)
    for (const o of [...this.ordens].reverse()) sel = [...sel].sort((a, b) => (o.asc ? 1 : -1) * cmp(a[o.col], b[o.col]))
    const total = sel.length
    if (this.rng) sel = sel.slice(this.rng[0], this.rng[1] + 1)
    else if (this.lim !== null) sel = sel.slice(0, this.lim)
    if (this.head) return { data: null, error: null, count: total }
    return this.finalizar(sel, total, this.contar ? total : undefined)
  }

  private finalizar(dados: Linha[] | null, n: number, count?: number): Resultado {
    const data = dados ? dados.map((r) => structuredClone(r)) : null // o banco real devolve CÓPIAS (nunca a linha viva)
    if (this.unico && data) {
      if (data.length > 1) return { data: null, error: { code: 'PGRST116', message: 'multiple rows' } }
      if (data.length === 0) return this.unico === 'single' ? { data: null, error: { code: 'PGRST116', message: 'no rows' } } : { data: null, error: null }
      return { data: data[0], error: null, count }
    }
    return { data, error: null, count: count ?? (this.contar ? n : undefined) }
  }
}

/**
 * Isolamento: toda consulta às tabelas do caderno deve filtrar/gravar tenant_id E estudante_id da sessão (RPCs: p_tenant/p_estudante).
 * `semEstudante` = tabelas que só têm tenant (ex.: simulado_questoes). Devolve a lista de violações (vazia = ok).
 */
export function violacoesDeEscopo(db: FakeDb, tenantId: string, estudanteId: string, opts: { semEstudante?: string[]; ignorar?: string[] } = {}): string[] {
  const out: string[] = []
  for (const c of db.calls) {
    if (opts.ignorar?.includes(c.table)) continue
    const precisaEstudante = !(opts.semEstudante ?? []).includes(c.table)
    if (c.op === 'insert' || c.op === 'upsert') {
      for (const p of Array.isArray(c.payload) ? c.payload : [c.payload as Linha]) {
        if (p.tenant_id !== tenantId) out.push(`${c.op} ${c.table}: tenant_id`)
        if (precisaEstudante && p.estudante_id !== estudanteId) out.push(`${c.op} ${c.table}: estudante_id`)
      }
    } else {
      if (c.eq.tenant_id !== tenantId) out.push(`${c.op} ${c.table}: sem eq tenant_id`)
      if (precisaEstudante && c.eq.estudante_id !== estudanteId) out.push(`${c.op} ${c.table}: sem eq estudante_id`)
    }
  }
  for (const r of db.rpcCalls) {
    if (r.params.p_tenant !== tenantId || r.params.p_estudante !== estudanteId) out.push(`rpc ${r.nome}: p_tenant/p_estudante`)
  }
  return out
}
