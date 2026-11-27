// Filtros MULTI-valor de questões em SQL — lógica PURA (sem server-only), compartilhada pela lista do Banco admin,
// pelas facetas (contagem por opção) e pelos testes. Valores múltiplos chegam como "a|b|c" (lerLista).
// Convenção: a tabela é sempre `simulado_questoes q` e o tenant é SEMPRE o parâmetro $1 do chamador.

import { lerLista } from '@/lib/aluno/filtros-multi'

export const DIMS_ADMIN = ['disciplina', 'assunto', 'detalhe', 'banca', 'orgao', 'cargo', 'ano', 'dificuldade', 'status', 'tipo', 'etiqueta'] as const
export type DimAdmin = (typeof DIMS_ADMIN)[number]
export type SelAdmin = Record<DimAdmin, string[]>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PERMITIDOS: Partial<Record<DimAdmin, string[]>> = {
  dificuldade: ['facil', 'medio', 'dificil'], status: ['publicada', 'rascunho', 'arquivada'], tipo: ['objetiva', 'discursiva'],
}
const MAX_ITENS = 60

/** assunto e tópico são a mesma "família": ao contar um, ignora-se o filtro de ambos. */
export const FAMILIA_ADMIN: Record<DimAdmin, DimAdmin[]> = {
  disciplina: ['disciplina'], assunto: ['assunto', 'detalhe'], detalhe: ['assunto', 'detalhe'], banca: ['banca'], orgao: ['orgao'],
  cargo: ['cargo'], ano: ['ano'], dificuldade: ['dificuldade'], status: ['status'], tipo: ['tipo'], etiqueta: ['etiqueta'],
}

/** Expressão do valor da dimensão (GROUP BY da faceta). */
export const COL_ADMIN: Record<Exclude<DimAdmin, 'etiqueta'>, string> = {
  disciplina: 'q.disciplina_id::text', assunto: 'q.assunto_id::text', detalhe: "nullif(btrim(q.assunto_detalhe), '')",
  banca: 'q.banca_id::text', orgao: 'q.orgao_id::text', cargo: "nullif(btrim(q.cargo), '')", ano: 'q.ano::text', dificuldade: 'q.nivel_dificuldade',
  status: 'q.status', tipo: 'q.tipo',
}

/** Higieniza a lista de uma dimensão (uuid/ano/whitelist). Itens inválidos são descartados. */
export function sanearLista(dim: DimAdmin, v: string[] | string | undefined | null): string[] {
  const l = (Array.isArray(v) ? v : lerLista(v)).slice(0, MAX_ITENS)
  if (dim === 'disciplina' || dim === 'assunto' || dim === 'banca' || dim === 'orgao' || dim === 'etiqueta') return l.filter((x) => UUID.test(x))
  if (dim === 'ano') return l.filter((x) => /^\d{4}$/.test(x))
  const ok = PERMITIDOS[dim]
  if (ok) return l.filter((x) => ok.includes(x))
  return l.map((x) => x.slice(0, 200))
}

/** Predicado SQL de UMA dimensão. `add` registra o parâmetro e devolve o placeholder ($n). Lista vazia (após higienizar) → 'false'. */
export function predicadoDim(dim: DimAdmin, valores: string[], add: (v: unknown) => string): string {
  if (!valores.length) return 'false'
  const ph = add(valores)
  switch (dim) {
    case 'disciplina': return `q.disciplina_id = any(${ph}::uuid[])`
    case 'banca': return `q.banca_id = any(${ph}::uuid[])`
    case 'orgao': return `q.orgao_id = any(${ph}::uuid[])`
    case 'ano': return `q.ano = any(${ph}::int[])`
    case 'dificuldade': return `q.nivel_dificuldade = any(${ph}::text[])`
    case 'status': return `q.status = any(${ph}::text[])`
    case 'tipo': return `q.tipo = any(${ph}::text[])`
    case 'detalhe': return `nullif(btrim(q.assunto_detalhe), '') = any(${ph}::text[])`
    case 'cargo': return `nullif(btrim(q.cargo), '') = any(${ph}::text[])`
    // assunto escolhido abrange os sub-assuntos (pai_id)
    case 'assunto': return `q.assunto_id in (with recursive t as (select id from simulado_assuntos where id = any(${ph}::uuid[]) and tenant_id = $1 union all select c.id from simulado_assuntos c join t on c.pai_id = t.id where c.tenant_id = $1) select id from t)`
    case 'etiqueta': return `exists (select 1 from simulado_questao_etiquetas fe where fe.questao_id = q.id and fe.etiqueta_id = any(${ph}::uuid[]))`
  }
}

/** Predicados de todas as dimensões com seleção, exceto as de `ignorar`. Dimensão selecionada só com lixo vira 'false'. */
export function condicoesFiltros(sel: Partial<Record<DimAdmin, string[] | string>>, add: (v: unknown) => string, ignorar: DimAdmin[] = []): string[] {
  const w: string[] = []
  for (const d of DIMS_ADMIN) {
    if (ignorar.includes(d)) continue
    const bruto = sel[d]
    const tinha = (Array.isArray(bruto) ? bruto : lerLista(bruto)).length > 0
    if (!tinha) continue
    w.push(predicadoDim(d, sanearLista(d, bruto), add))
  }
  return w
}
