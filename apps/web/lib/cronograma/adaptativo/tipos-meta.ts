/**
 * REGISTRO ÚNICO DOS TIPOS DE META do Cronograma Adaptativo (A3).
 *
 * Antes, o catálogo de tipos vivia duplicado em motor28.ts (DUR/DUR_REVISAO/offsets), params.ts (defaults), plano-metas.ts
 * (TIPO_NOME/ORDEM_TIPO), meta-ids.ts (rótulos de variantes) e no `TIPOS` literal do iframe. Agora há UMA fonte:
 * slug, rótulo, família, duração padrão, deslocamento padrão, prioridade padrão e ordem de exibição.
 *
 * Módulo PURO (sem imports, sem 'server-only'): é compilado junto do motor para o iframe (window.Motor28).
 * Os VALORES CONFIGURÁVEIS por tenant continuam em params.ts / regras.ts — aqui ficam só os padrões e o vocabulário.
 */

export type SlugMeta = 'pf' | 'pp' | 'fl' | 'qu' | 'lp' | 'rf' | 'rq' | 'jp' | 'gx'
export type FamiliaMeta = 'pf' | 'fl' | 'qu' | 'lp' | 'jp' | 'gx'
/** Campo de ParamsAdaptativo que guarda a duração (min) do tipo; `null` = duração calculada (PDFull: páginas ÷ ritmo). */
export type ParamDuracao = 'durFl' | 'durQu' | 'durLp' | 'durRf' | 'durRq' | 'jurisprudenciaMin' | null
export type ParamDeslocamento = 'offsetRevisao' | 'offsetQuestoes' | null

export interface TipoMeta {
  slug: SlugMeta
  rotulo: string
  /** Nome mostrado ao ALUNO no iframe (TIPOS[k].nome) — pode diferir do rótulo administrativo (ex.: 'PDFULL', 'Revisão'). */
  nomeAluno: string
  familia: FamiliaMeta
  /** Duração padrão em minutos (null = calculada). */
  duracaoPadraoMin: number | null
  /** Campo de params que sobrescreve a duração por tenant. */
  paramDuracao: ParamDuracao
  /** Deslocamento padrão (semanas de conteúdo após o PDFull) — só fl/qu. */
  deslocamentoPadraoSem: number | null
  paramDeslocamento: ParamDeslocamento
  /** Prioridade padrão no reagendamento (dominó): menor = primeiro. */
  prioridade: number
  /** Ordem de exibição dentro do dia. */
  ordem: number
}

export const TIPOS_META: Readonly<Record<SlugMeta, TipoMeta>> = {
  pf: { slug: 'pf', rotulo: 'PDFull', nomeAluno: 'PDFULL', familia: 'pf', duracaoPadraoMin: null, paramDuracao: null, deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 0, ordem: 0 },
  pp: { slug: 'pp', rotulo: 'PDFull (parte)', nomeAluno: 'PDFULL', familia: 'pf', duracaoPadraoMin: null, paramDuracao: null, deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 0, ordem: 0 },
  fl: { slug: 'fl', rotulo: 'PDFlash', nomeAluno: 'Revisão', familia: 'fl', duracaoPadraoMin: 60, paramDuracao: 'durFl', deslocamentoPadraoSem: 1, paramDeslocamento: 'offsetRevisao', prioridade: 1, ordem: 1 },
  qu: { slug: 'qu', rotulo: 'Questões', nomeAluno: 'Questões', familia: 'qu', duracaoPadraoMin: 30, paramDuracao: 'durQu', deslocamentoPadraoSem: 2, paramDeslocamento: 'offsetQuestoes', prioridade: 2, ordem: 2 },
  lp: { slug: 'lp', rotulo: 'LegProc', nomeAluno: 'LegProc', familia: 'lp', duracaoPadraoMin: 30, paramDuracao: 'durLp', deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 6, ordem: 3 },
  rf: { slug: 'rf', rotulo: 'Revisão PDFlash', nomeAluno: 'Revisão', familia: 'fl', duracaoPadraoMin: 60, paramDuracao: 'durRf', deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 1, ordem: 4 },
  rq: { slug: 'rq', rotulo: 'Revisão Questões', nomeAluno: 'Questões', familia: 'qu', duracaoPadraoMin: 30, paramDuracao: 'durRq', deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 2, ordem: 4 },
  jp: { slug: 'jp', rotulo: 'Jurisprudência', nomeAluno: 'Jurisprudência', familia: 'jp', duracaoPadraoMin: 60, paramDuracao: 'jurisprudenciaMin', deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 6, ordem: 4 },
  gx: { slug: 'gx', rotulo: 'Personalizado', nomeAluno: 'Personalizado', familia: 'gx', duracaoPadraoMin: 30, paramDuracao: null, deslocamentoPadraoSem: null, paramDeslocamento: null, prioridade: 5, ordem: 5 },
}

export const SLUGS_META = Object.keys(TIPOS_META) as SlugMeta[]

/** Variantes de id: `pf|fl:i:revisao:s`, `pf|fl:i:reforco:s`, `qu:i:hist:s`. */
export type VarianteMeta = 'revisao' | 'reforco' | 'historico'
export const ROTULO_VARIANTE: Readonly<Record<VarianteMeta, (slug: string) => string>> = {
  revisao: (s) => `Revisão adaptativa (${s === 'pf' ? TIPOS_META.pf.rotulo : TIPOS_META.fl.rotulo})`,
  reforco: (s) => `Reforço (${s === 'pf' ? TIPOS_META.pf.rotulo : TIPOS_META.fl.rotulo})`,
  historico: () => 'Questões (diagnóstico)',
}
/** Sufixos de variante, na forma que aparecem no id. */
export const SUFIXO_VARIANTE: Readonly<Record<VarianteMeta, string>> = { revisao: 'revisao', reforco: 'reforco', historico: 'hist' }

export const ehSlugMeta = (s: string): s is SlugMeta => Object.prototype.hasOwnProperty.call(TIPOS_META, s)

/** Rótulo do tipo a partir do slug (ou null). */
export function rotuloTipo(slug: string): string | null { return ehSlugMeta(slug) ? TIPOS_META[slug].rotulo : null }
/** Ordem de exibição do tipo no dia (9 = desconhecido). */
export function ordemTipo(slug: string): number { return ehSlugMeta(slug) ? TIPOS_META[slug].ordem : 9 }
/** Família do tipo (pp→pf, rf→fl, rq→qu); desconhecido → o próprio slug. */
export function familiaDoTipo(slug: string): string { return ehSlugMeta(slug) ? TIPOS_META[slug].familia : slug }
/** Duração padrão (min) do tipo; `fallback` quando calculada/desconhecida. */
export function duracaoPadrao(slug: SlugMeta, fallback = 0): number { return TIPOS_META[slug].duracaoPadraoMin ?? fallback }
/** Mapa slug → prioridade padrão (para o dominó). */
export function prioridadesPadrao(): Record<string, number> {
  const o: Record<string, number> = {}
  for (const s of SLUGS_META) o[s] = TIPOS_META[s].prioridade
  return o
}
/** Nomes exibidos ao aluno por slug — vão em `conteudo.tiposMeta` do GET; o iframe mantém o literal atual como fallback. */
export function nomesAlunoPorSlug(): Record<string, string> {
  const o: Record<string, string> = {}
  for (const s of SLUGS_META) o[s] = TIPOS_META[s].nomeAluno
  return o
}
/** Rótulos por slug — é o que o GET do iframe recebe em `conteudo.tiposMeta`. */
export function rotulosPorSlug(): Record<string, string> {
  const o: Record<string, string> = {}
  for (const s of SLUGS_META) o[s] = TIPOS_META[s].rotulo
  return o
}
