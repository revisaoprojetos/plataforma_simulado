/**
 * SELEÇÃO de conteúdo do GERADOR por aula do conjunto (puro, sem I/O — roda em node/vitest).
 *
 * A matriz de aulas (/admin/cronogramas/conteudos/[id]) grava em `simulado_conteudo_selecao_meta` (area='gerador') o
 * documento/parte da Biblioteca escolhido para (conjunto, aula, seção). A `meta_chave` é ESTÁVEL — nunca posição:
 *     cj:<conjunto_id>|<aula normalizada>|<tipo da seção>          ex.: cj:6f1e…|3|pdfull
 *  · conjunto_id  = uuid do conjunto (renomear/trocar a disciplina do conjunto NÃO orfana a seleção);
 *  · aula         = "01" e "1" são a mesma aula (mesma regra do editor/propagação: dígitos → Number; texto → minúsculo);
 *  · tipo         = slug da seção (tipo de meta: pdfull, flash, legproc…).
 *
 * Consumo: as metas do cronograma são CÓPIAS (disciplina + aula + tipo). Para achar a seleção de uma meta, as seleções são
 * indexadas pela chave natural `<chave da disciplina>|<aula>|<tipo>` (a mesma que links e propagação já usam); o conjunto de
 * menor `ordem` vence quando duas disciplinas iguais têm conjuntos diferentes.
 *
 * Regra de ouro (compat): SEM nenhuma seleção, `aplicarSelecoes` devolve o MESMO Map recebido (resultado idêntico ao de antes).
 */

import { chaveDisc, materialDaMeta, type ConteudoResolvido, type MetaParaConteudo } from './conteudo-meta'

export const AREA_GERADOR = 'gerador'

/** "01"/"1" → "1"; "1.1" → "1.1"; "Revisão" → "revisão"; vazio → "". (Mesma regra do editor de conjuntos.) */
export function chaveAulaGerador(aula: string | null | undefined): string {
  const t = String(aula ?? '').trim()
  if (!t) return ''
  return /^\d+$/.test(t) ? String(Number(t)) : t.toLowerCase()
}

export function chaveSelecaoGerador(conjuntoId: string, aula: string | null | undefined, tipo: string): string {
  return `cj:${conjuntoId}|${chaveAulaGerador(aula)}|${tipo}`
}

export const prefixoSelecaoConjunto = (conjuntoId: string) => `cj:${conjuntoId}|`

export function lerChaveSelecao(chave: string): { conjuntoId: string; aula: string; tipo: string } | null {
  if (!chave.startsWith('cj:')) return null
  const [conjuntoId, aula, ...resto] = chave.slice(3).split('|')
  const tipo = resto.join('|')
  if (!conjuntoId || aula === undefined || !tipo) return null
  return { conjuntoId, aula, tipo }
}

export interface SelecaoGerador {
  metaChave: string
  documentoId: string
  parteId: string | null
  rotuloAluno: string | null
  visivelAluno: boolean
}

export interface ConjuntoRef { id: string; disciplina: string; ordem: number }

export type IndiceSelecoes = Map<string, SelecaoGerador>

const chaveNatural = (disciplina: string, aula: string, tipo: string) => `${chaveDisc(disciplina)}|${aula}|${tipo}`

/** Indexa as seleções pela chave natural (disciplina|aula|tipo). Seleção de conjunto desconhecido (apagado) é ignorada. */
export function indexarSelecoes(selecoes: SelecaoGerador[], conjuntos: ConjuntoRef[]): IndiceSelecoes {
  const idx: IndiceSelecoes = new Map()
  if (!selecoes.length) return idx
  const porId = new Map(conjuntos.map((c) => [c.id, c] as const))
  const ordemDe = new Map<string, number>()
  for (const s of selecoes) {
    const k = lerChaveSelecao(s.metaChave)
    const c = k ? porId.get(k.conjuntoId) : null
    if (!k || !c || !k.aula) continue
    const nat = chaveNatural(c.disciplina, k.aula, k.tipo)
    const ordem = c.ordem ?? 0
    const atual = ordemDe.get(nat)
    if (atual === undefined || ordem < atual || (ordem === atual && s.metaChave < (idx.get(nat)?.metaChave ?? ''))) {
      idx.set(nat, s)
      ordemDe.set(nat, ordem)
    }
  }
  return idx
}

/** Seleção que vale para a meta (disciplinas candidatas × aula × tipo), ou null. */
export function selecaoDaMeta(meta: Pick<MetaParaConteudo, 'tipo' | 'disciplinas' | 'aula'>, idx: IndiceSelecoes): SelecaoGerador | null {
  if (!idx.size) return null
  const aula = chaveAulaGerador(meta.aula)
  if (!aula) return null
  for (const d of meta.disciplinas) {
    const s = idx.get(chaveNatural(d, aula, meta.tipo))
    if (s) return s
  }
  return null
}

export type ResolvidoComSelecao = ConteudoResolvido & { parteId?: string | null; rotuloAluno?: string | null; viaSelecao?: true }

/**
 * Aplica as seleções por cima do resolvido atual (vínculo explícito do cronograma > automático):
 *  · seleção visível → documento/parte escolhidos PREVALECEM (origem 'explicito', sem página);
 *  · seleção oculta (`visivel_aluno=false`) → a meta fica SEM documento (o admin escondeu);
 *  · meta sem seleção → resolvido de antes, intacto.
 * Sem seleções devolve o próprio `base` (identidade).
 */
export function aplicarSelecoes(
  metas: Pick<MetaParaConteudo, 'id' | 'tipo' | 'disciplinas' | 'aula'>[],
  base: Map<string, ConteudoResolvido>,
  idx: IndiceSelecoes,
): Map<string, ResolvidoComSelecao> {
  if (!idx.size) return base
  const out = new Map<string, ResolvidoComSelecao>(base)
  for (const m of metas) {
    const s = selecaoDaMeta(m, idx)
    if (!s) continue
    if (!s.visivelAluno) { out.delete(m.id); continue }
    out.set(m.id, { docId: s.documentoId, origem: 'explicito', pagina: null, parteId: s.parteId, rotuloAluno: s.rotuloAluno, viaSelecao: true })
  }
  return out
}

const ALIAS_TIPO_CLASSIFICACAO: Record<string, string> = { flash: 'pdflash', quest: 'questoes', juris: 'jurisclub' }

/**
 * Classificação (slug) que a seção representa. Slug igual ao do catálogo vence; depois os apelidos históricos
 * (flash→pdflash, quest→questoes, juris→jurisclub); depois o papel de material (materialDaMeta). null = sem classificação.
 */
export function classificacaoSlugDoTipo(tipo: string, slugsCatalogo: ReadonlySet<string>): string | null {
  if (slugsCatalogo.has(tipo)) return tipo
  const alias = ALIAS_TIPO_CLASSIFICACAO[tipo]
  if (alias && (slugsCatalogo.size === 0 || slugsCatalogo.has(alias))) return alias
  const mat = materialDaMeta(tipo)
  if (mat && (slugsCatalogo.size === 0 || slugsCatalogo.has(mat))) return mat
  return null
}
