// CATÁLOGO ESTÁVEL do Cronograma Adaptativo. Módulo PURO (sem 'server-only'; testável).
//
// O PROBLEMA: o motor identifica cada meta pela POSIÇÃO da aula no catálogo (`pf:12` = 13ª aula de AS;
// `lp:3:0` = 1º bloco da 3ª semana de lei seca). O catálogo é remontado da Biblioteca a cada acesso,
// então qualquer aula nova, renomeação, mudança de "ordem"/classificação de disciplina ou disciplina
// ocultada DESLOCA as posições — e o plano salvo passa a apontar para aulas de OUTRAS disciplinas
// (umas aparecem em dobro, outras zeram; o progresso marcado "migra" para a aula errada).
//
// A SOLUÇÃO: cada plano guarda (em `cfg._cat`) as CHAVES das aulas na ordem em que foram numeradas
// quando o plano foi gerado ("espaço do plano"). As metas continuam gravadas por posição nesse espaço
// (banco e motor intocados), e este módulo TRADUZ os ids entre o espaço do plano e o catálogo atual:
//  · leitura  (banco → tela): plano → atual
//  · gravação (tela → banco): atual → plano (aulas novas são ANEXADAS ao fim do catálogo do plano,
//    então posições antigas nunca mudam de significado)
// Chave da aula = id do documento da Biblioteca (7º campo de AS); no seed (sem doc) = disciplina|tema.

import type { AS, WLP } from './engine'

export interface Catalogo {
  /** chave de cada aula, indexada pela posição no espaço do plano (pf/pp/fl/qu/rf/rq) */
  a: string[]
  /** chave de cada SEMANA de lei seca (lp:s:j → lp[s]); '' = semana vazia */
  lp: string[]
}

export const chaveAula = (e: AS[number]): string => (e[7] ? String(e[7]) : e[6] ? `d:${e[6]}` : `t:${e[0]}|${e[2]}`)

/** Chaves do catálogo atual (mesma numeração que o motor usa sobre AS/WLP). */
export function chavesConteudo(AS: AS, WLP: WLP, WLPdoc?: (string | null)[][]): Catalogo {
  return {
    a: AS.map(chaveAula),
    lp: WLP.map((linha, s) => {
      const doc = WLPdoc?.[s]?.[0]
      if (doc) return `d:${doc}`
      const txt = (linha || []).filter((t) => t && t.trim())
      return txt.length ? `t:${txt.join('|')}` : ''
    }),
  }
}

export function catalogoValido(v: unknown): v is Catalogo {
  if (!v || typeof v !== 'object') return false
  const c = v as Record<string, unknown>
  return Array.isArray(c.a) && Array.isArray(c.lp) && c.a.every((x) => typeof x === 'string') && c.lp.every((x) => typeof x === 'string')
}

const iguais = (x: string[], y: string[]) => x.length === y.length && x.every((v, i) => v === y[i])
export const catalogosIguais = (x: Catalogo, y: Catalogo) => iguais(x.a, y.a) && iguais(x.lp, y.lp)

/** Garante que o catálogo do plano contém todas as chaves do atual (anexa as novas ao fim). */
export function estenderCatalogo(doPlano: Catalogo, atual: Catalogo): { cat: Catalogo; mudou: boolean } {
  const anexar = (base: string[], novas: string[]) => {
    const tem = new Set(base)
    const out = [...base]
    for (const k of novas) if (k && !tem.has(k)) { out.push(k); tem.add(k) }
    return out
  }
  const a = anexar(doPlano.a, atual.a)
  const lp = anexar(doPlano.lp, atual.lp)
  return { cat: { a, lp }, mudou: a.length !== doPlano.a.length || lp.length !== doPlano.lp.length }
}

export type Tradutor = (id: string) => string | null

/**
 * Tradutor de ids de meta do catálogo `de` para o catálogo `para`. Devolve null quando a aula/semana
 * não existe no destino (ex.: documento removido da Biblioteca). Ids de formato desconhecido passam intactos.
 */
export function tradutor(de: Catalogo, para: Catalogo): Tradutor {
  if (catalogosIguais(de, para)) return (id) => id
  const pos = (lista: string[]) => {
    const m = new Map<string, number>()
    lista.forEach((k, i) => { if (k && !m.has(k)) m.set(k, i) })
    return m
  }
  const pa = pos(para.a), pl = pos(para.lp)
  const aula = (i: string): number | null => {
    const k = de.a[Number(i)]
    const n = k ? pa.get(k) : undefined
    return n == null ? null : n
  }
  const sem = (s: string): number | null => {
    const k = de.lp[Number(s)]
    const n = k ? pl.get(k) : undefined
    return n == null ? null : n
  }
  return (id) => {
    const [t, a, b] = id.split(':')
    switch (t) {
      case 'pf': case 'fl': case 'qu': { const i = aula(a); return i == null ? null : `${t}:${i}` }
      case 'pp': { const i = aula(a); return i == null ? null : `pp:${i}:${b}` }
      case 'rf': case 'rq': { const i = aula(b); return i == null ? null : `${t}:${a}:${i}` }
      case 'lp': { const s = sem(a); return s == null ? null : `lp:${s}:${b}` }
      default: return id
    }
  }
}

/** Aplica o tradutor às chaves de um objeto (plano/prog/notas). Ids sem destino são descartados. */
export function traduzirChaves<T>(obj: Record<string, T> | null | undefined, tr: Tradutor): Record<string, T> {
  const out: Record<string, T> = {}
  for (const [id, v] of Object.entries(obj || {})) { const n = tr(id); if (n) out[n] = v }
  return out
}

/** Aplica o tradutor às semanas de revisão materializadas ({sem: [[id, data], ...]}). */
export function traduzirRevs<D>(revs: Record<number, Array<[string, D]>> | null | undefined, tr: Tradutor): Record<number, Array<[string, D]>> {
  const out: Record<number, Array<[string, D]>> = {}
  for (const [sem, lista] of Object.entries(revs || {})) {
    out[Number(sem)] = (lista || []).flatMap(([id, d]) => { const n = tr(id); return n ? [[n, d] as [string, D]] : [] })
  }
  return out
}

// ── Disciplinas: nomes equivalentes ───────────────────────────────────────────────────────────────
/**
 * Chave canônica do nome da disciplina — junta grafias que são a MESMA matéria:
 * "Eleitoral" = "Direito Eleitoral", "Processo do Trabalho" = "Direito Processual do Trabalho",
 * "Internacional Privado" = "Direito Internacional Privado" (sem acento/caixa/espaços extras).
 * Não junta nomes com sufixos (ex.: "Direito Administrativo - verificar" continua separado).
 */
export function chaveDisciplina(nome: string): string {
  return String(nome || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/^direito /, '')
    .replace(/^processual /, 'processo ')
}

/** Reescreve a seleção de disciplinas do aluno para os nomes atuais (sem duplicar). */
export function normalizarDiscs(discs: unknown, nomeAtual: (n: string) => string): string[] {
  if (!Array.isArray(discs)) return []
  const out: string[] = []
  const vistos = new Set<string>()
  for (const d of discs) {
    if (typeof d !== 'string' || !d) continue
    const n = nomeAtual(d)
    if (!vistos.has(n)) { vistos.add(n); out.push(n) }
  }
  return out
}
