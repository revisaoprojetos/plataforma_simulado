// Filtros do BANCO DE QUESTÕES do Estúdio (admin) — lógica PURA (sem server-only), usada pela page, pela rota de facetas,
// pelo export e pelo card de filtros. Reusa o núcleo compartilhado (lib/filtros/questoes-sql): multi-seleção "a|b|c" por
// dimensão, higienização, predicados SQL. Aqui só entram o ESCOPO do Estúdio (questões DE UM banco = simulado_questao_pasta),
// a busca e o filtro "com/sem comentário", que não são dimensões do núcleo.

import { DIMS_ADMIN, condicoesFiltros, sanearLista, type DimAdmin } from '@/lib/filtros/questoes-sql'
import { juntarLista } from '@/lib/aluno/filtros-multi'

/** Nome do parâmetro de URL de cada dimensão (mesmos nomes do Banco da Biblioteca). */
export const PARAM_DIM: Record<DimAdmin, string> = {
  disciplina: 'disc', assunto: 'ass', detalhe: 'det', banca: 'banca', orgao: 'orgao', cargo: 'cargo', ano: 'ano',
  dificuldade: 'dif', status: 'status', tipo: 'tipo', etiqueta: 'etq',
}
export const PARAM_COM = 'com'

export type Comentario = '' | 'com' | 'sem'
export type SelEstudio = Record<DimAdmin, string[]>
export interface FiltrosEstudio { sel: SelEstudio; q: string; com: Comentario }

export const selVazia = (): SelEstudio => Object.fromEntries(DIMS_ADMIN.map((d) => [d, []])) as unknown as SelEstudio
export const FILTROS_VAZIOS: FiltrosEstudio = { sel: selVazia(), q: '', com: '' }

/** Lê (e higieniza) os filtros de uma querystring. `get` = searchParams.get ou lookup de objeto. */
export function filtrosDeParams(get: (k: string) => string | null | undefined): FiltrosEstudio {
  const sel = selVazia()
  for (const d of DIMS_ADMIN) sel[d] = sanearLista(d, get(PARAM_DIM[d]))
  const com = get(PARAM_COM)
  return { sel, q: (get('q') ?? '').trim().slice(0, 80), com: com === 'com' || com === 'sem' ? com : '' }
}

/** Parâmetros só com o que está preenchido (sem `q`: a busca pertence à tabela). */
export function paramsDeFiltros(f: FiltrosEstudio, incluirQ = false): URLSearchParams {
  const p = new URLSearchParams()
  for (const d of DIMS_ADMIN) { const v = juntarLista(f.sel[d]); if (v) p.set(PARAM_DIM[d], v) }
  if (f.com) p.set(PARAM_COM, f.com)
  if (incluirQ && f.q) p.set('q', f.q)
  return p
}

/** Nº de filtros do card ativos (cada valor selecionado conta 1; "com/sem comentário" conta 1). */
export function contarAplicados(f: FiltrosEstudio): number {
  return DIMS_ADMIN.reduce((n, d) => n + f.sel[d].length, 0) + (f.com ? 1 : 0)
}

export type OpcaoNome = { id: string; nome: string }
export interface OpcoesEstudio {
  disciplinas: OpcaoNome[]
  assuntos: { id: string; nome: string; pai_id: string | null; disciplina_id: string | null }[]
  detalhes: { assunto_id: string; nome: string }[]
  bancas: OpcaoNome[]
  orgaos: OpcaoNome[]
  etiquetas: OpcaoNome[]
  cargos: string[]
  anos: number[]
}
export type ContagensEstudio = Record<DimAdmin, Record<string, number>>
export interface FacetasEstudio { total: number; contagens: ContagensEstudio }

/** Escopo + busca + "com/sem comentário" (tabela `simulado_questoes q`; tenant em $1, banco em $2). Sem os filtros por dimensão. */
export function baseBancoSql(tenantId: string, bancoId: string, f: Pick<FiltrosEstudio, 'q' | 'com'>, somenteId?: string): { sql: string; params: unknown[] } {
  const params: unknown[] = [tenantId, bancoId]
  const add = (v: unknown) => { params.push(v); return `$${params.length}` }
  const w = [
    'q.tenant_id = $1', 'q.deletado = false',
    'q.id in (select qp.questao_id from simulado_questao_pasta qp where qp.tenant_id = $1 and qp.pasta_id = $2::uuid)',
  ]
  if (somenteId) w.push(`q.id = ${add(somenteId)}::uuid`)
  if (f.com === 'com') w.push("nullif(btrim(q.comentario_professor), '') is not null")
  else if (f.com === 'sem') w.push("nullif(btrim(q.comentario_professor), '') is null")
  const busca = f.q.replace(/[\\%_]/g, (c) => `\\${c}`).trim()
  if (busca) {
    const like = add(`%${busca}%`)
    w.push(`(q.enunciado ilike ${like} or q.assunto_detalhe ilike ${like})`)
  }
  return { sql: w.join(' and '), params }
}

/** WHERE completo da LISTA: escopo/busca + filtros multi-seleção do card. */
export function whereBancoSql(tenantId: string, bancoId: string, f: FiltrosEstudio, somenteId?: string): { sql: string; params: unknown[] } {
  const b = baseBancoSql(tenantId, bancoId, f, somenteId)
  const add = (v: unknown) => { b.params.push(v); return `$${b.params.length}` }
  return { sql: [b.sql, ...condicoesFiltros(f.sel, add)].join(' and '), params: b.params }
}

/** Ordenação aceita na lista do banco (whitelist; vale no servidor). */
export const ORDEM_BANCO_SQL: Record<string, string> = {
  numero: 'b.numero',
  ano: 'q.ano',
  dificuldade: "case q.nivel_dificuldade when 'facil' then 0 when 'medio' then 1 when 'dificil' then 2 else 3 end",
}
export const ordemBanco = (k: string | null | undefined) => (k && k in ORDEM_BANCO_SQL ? k : 'numero')

/** Chaves de contagem → opções do card: só valores que existem no escopo (a contagem base lista o que há no banco). */
export function idsDaContagem(c: ContagensEstudio, d: DimAdmin): string[] {
  return Object.keys(c[d] ?? {})
}

/** Rótulos dos filtros, p/ chips e resumo. */
export const ROTULO_DIM: Record<DimAdmin, string> = {
  disciplina: 'Disciplina', assunto: 'Assunto', detalhe: 'Tópico', banca: 'Banca', orgao: 'Órgão', cargo: 'Cargo', ano: 'Ano',
  dificuldade: 'Dificuldade', status: 'Status', tipo: 'Tipo', etiqueta: 'Etiqueta',
}
export const ROTULO_VALOR: Partial<Record<DimAdmin, Record<string, string>>> = {
  dificuldade: { facil: 'Fácil', medio: 'Médio', dificil: 'Difícil' },
  status: { publicada: 'Ativa', rascunho: 'Rascunho', arquivada: 'Arquivada' },
  tipo: { objetiva: 'Objetiva', discursiva: 'Discursiva' },
}
