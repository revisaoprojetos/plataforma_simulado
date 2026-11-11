/**
 * Chave ESTÁVEL de meta do cronograma legado + lógica pura de diff/reencaixe.
 *
 * Por quê: reimportar o catálogo fazia DELETE + INSERT, gerando ids novos e deixando o
 * progresso do aluno (checks/notas) órfão. Com a chave, a reimportação vira DIFF: quem
 * continua existindo mantém o id; só quem realmente saiu é apagado; e checks/notas guardam
 * `chave_meta` para reencaixar em metas que reapareçam com outro id.
 *
 * A fonte de verdade em produção é o SQL (simulado_cronograma_recalcular_chaves /
 * simulado_cronograma_aplicar_metas, migration 20261114020000). Este módulo é o ESPELHO puro:
 * mesma normalização e mesmo algoritmo, usado para testes, pré-visualização de diff e para
 * reencaixar órfãs. Módulo PURO — sem I/O.
 *
 * Chave = md5( cronograma_id | semana | dia | tipo | (disciplina_id ?? norm(disciplina)) |
 *              norm(aula) | ocorrência ), onde "ocorrência" é a posição (1,2,…) da linha entre
 * as de mesma (semana, dia, tipo, disciplina, aula), ordenadas por (ordem, desempate).
 */

import { createHash } from 'node:crypto'

const DE = 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ'
const PARA = 'AAAAAEEEEIIIIOOOOOUUUUCNaaaaaeeeeiiiiooooouuuucn'
const MAPA = new Map<string, string>([...DE].map((c, i) => [c, PARA[i]]))

/** Espelho de `simulado_cronograma_norm` (translate + espaços colapsados + minúsculas). */
export function normalizarChave(s: string | null | undefined): string {
  let out = ''
  for (const c of s ?? '') out += MAPA.get(c) ?? c
  return out.replace(/\s+/g, ' ').trim().toLowerCase()
}

export type MetaChaveavel = {
  semana: number
  dia: number
  tipo: string
  disciplina: string
  disciplina_id?: string | null
  aula?: string | null
  ordem?: number | null
}

function baseChave(m: MetaChaveavel): string {
  return [m.semana, m.dia, m.tipo, m.disciplina_id ?? normalizarChave(m.disciplina), normalizarChave(m.aula)].join('|')
}

function md5(s: string): string {
  return createHash('md5').update(s).digest('hex')
}

/**
 * Chaves de uma lista de metas, NA MESMA ORDEM da entrada. A ocorrência desempata linhas
 * idênticas por (ordem, posição na entrada) — a mesma regra do SQL (ordem, criado_em, id).
 */
export function calcularChaves(cronogramaId: string, metas: MetaChaveavel[]): string[] {
  const grupos = new Map<string, number[]>()
  metas.forEach((m, i) => {
    const k = baseChave(m)
    const l = grupos.get(k)
    if (l) l.push(i)
    else grupos.set(k, [i])
  })
  const out = new Array<string>(metas.length)
  for (const [k, idxs] of grupos) {
    const ordenados = [...idxs].sort((a, b) => (metas[a].ordem ?? 0) - (metas[b].ordem ?? 0) || a - b)
    ordenados.forEach((i, n) => {
      out[i] = md5(`${cronogramaId}|${k}|${n + 1}`)
    })
  }
  return out
}

export type ExistenteComChave = { id: string; chave: string | null }
export type DiffMetas = {
  /** Metas que continuam: mantêm o `id` (índice na lista nova → id existente). */
  manter: { indice: number; id: string }[]
  /** Índices (na lista nova) sem correspondente: viram INSERT. */
  inserir: number[]
  /** Ids existentes que não aparecem mais: viram DELETE. */
  remover: string[]
}

/**
 * Diff por chave. `existentes` precisa ter `chave` preenchida (chave nula nunca casa — vira
 * remover/inserir, o comportamento antigo). `chavesNovas` vem de `calcularChaves`.
 */
export function diffPorChave(existentes: ExistenteComChave[], chavesNovas: string[]): DiffMetas {
  const porChave = new Map<string, string>()
  for (const e of existentes) if (e.chave) porChave.set(e.chave, e.id)
  const usadas = new Set<string>()
  const manter: DiffMetas['manter'] = []
  const inserir: number[] = []
  chavesNovas.forEach((c, indice) => {
    const id = porChave.get(c)
    if (id && !usadas.has(id)) {
      usadas.add(id)
      manter.push({ indice, id })
    } else inserir.push(indice)
  })
  const remover = existentes.filter((e) => !usadas.has(e.id)).map((e) => e.id)
  return { manter, inserir, remover }
}

export type LinhaProgresso<T> = { meta_id: string; chave_meta?: string | null } & T

/**
 * Reencaixa linhas de progresso (checks/notas) cujo `meta_id` não existe mais: se o
 * `chave_meta` casa com uma meta ATUAL, a linha passa a apontar para ela. Linhas com meta
 * existente ficam como estão; sem casamento, ficam órfãs (inalteradas). Em colisão (a meta
 * destino já tem linha própria) a linha própria vence e a órfã é descartada do resultado.
 */
export function reencaixarPorChave<T>(
  linhas: LinhaProgresso<T>[],
  metasAtuais: { id: string; chave: string | null }[],
): { linhas: LinhaProgresso<T>[]; reencaixadas: { de: string; para: string }[] } {
  const ids = new Set(metasAtuais.map((m) => m.id))
  const idPorChave = new Map<string, string>()
  for (const m of metasAtuais) if (m.chave) idPorChave.set(m.chave, m.id)
  const proprias = new Set(linhas.filter((l) => ids.has(l.meta_id)).map((l) => l.meta_id))
  const saida: LinhaProgresso<T>[] = []
  const reencaixadas: { de: string; para: string }[] = []
  for (const l of linhas) {
    if (ids.has(l.meta_id)) {
      saida.push(l)
      continue
    }
    const alvo = l.chave_meta ? idPorChave.get(l.chave_meta) : undefined
    if (alvo && !proprias.has(alvo)) {
      proprias.add(alvo)
      reencaixadas.push({ de: l.meta_id, para: alvo })
      saida.push({ ...l, meta_id: alvo })
    } else if (!alvo) {
      saida.push(l) // órfã sem casamento: mantém (legível pelos snapshots data/titulo)
    }
  }
  return { linhas: saida, reencaixadas }
}
