/**
 * FAIXAS DE CARGA SEMANAL DINÂMICAS (`RegrasMotor.faixas[]`).
 *
 * Até a 3.2.0 o motor tinha faixas hard-coded (<15h / ≤24h30 / >24h30) e tetos por corte (14h30/24h30/35h). Agora a carga semanal
 * (soma das horas da rotina, em minutos) cai em UMA faixa da lista; cada faixa define o teto de PDFulls novos, o modo de revisão
 * (ciclo | desempenho), a periodicidade, o modo de questões e se é "equilibrada", além de OVERRIDES opcionais de parâmetros.
 *
 * Módulo PURO (sem zod, sem server-only): é compilado junto do motor para o iframe. O padrão reproduz EXATAMENTE o comportamento
 * anterior (golden 125/125). Sem Date/Math.random.
 */
import type { RegrasMotor } from './regras'

/** Revisão: 'ciclo' = semana de revisão obrigatória a cada N semanas (PDFlash/questões pendentes); 'desempenho' = semana especial por desempenho. */
export type ModoRevisao = 'ciclo' | 'desempenho'
/**
 * Onde as questões regulares caem no fluxo diário (a "classe" legada 1/2/3 do motor):
 * revisao = só nos dias de revisão (classe 1) · revisao_pdf = dias de revisão e de PDFull (classe 2) · livre = qualquer dia, PDFlash antes (classe 3).
 */
export type ModoQuestoes = 'revisao' | 'revisao_pdf' | 'livre'
export const MODOS_REVISAO: readonly ModoRevisao[] = ['ciclo', 'desempenho']
export const MODOS_QUESTOES: readonly ModoQuestoes[] = ['revisao', 'revisao_pdf', 'livre']
export const ROTULO_MODO_REVISAO: Readonly<Record<ModoRevisao, string>> = { ciclo: 'Ciclo obrigatório', desempenho: 'Semana especial por desempenho' }
export const ROTULO_MODO_QUESTOES: Readonly<Record<ModoQuestoes, string>> = { revisao: 'Só nos dias de revisão', revisao_pdf: 'Dias de revisão e de PDFull', livre: 'Qualquer dia' }

/** Seções de `RegrasMotor` que uma faixa pode sobrescrever (resolução: padrão global → override da faixa). */
export const SECOES_OVERRIDE = ['limitesDia', 'legproc', 'divisao', 'desempenho', 'juris', 'retaFinal', 'rotina', 'equilibrio', 'adaptacao'] as const
export type SecaoOverride = (typeof SECOES_OVERRIDE)[number]
export const ROTULO_SECAO: Readonly<Record<SecaoOverride, string>> = {
  limitesDia: 'Limites por dia', legproc: 'LegProc por dia', divisao: 'Divisão das leituras', desempenho: 'Limiares de desempenho',
  juris: 'Jurisprudência', retaFinal: 'Reta final', rotina: 'Rotina da semana', equilibrio: 'Faixa equilibrada', adaptacao: 'Adaptação (interruptores)',
}
export type OverridesFaixa = { [K in SecaoOverride]?: Partial<RegrasMotor[K]> }

export interface FaixaCarga {
  /** Identificador estável (f1, f2…). */
  id: string
  nome: string
  /** Carga semanal mínima (min), inclusiva. A 1ª faixa começa em 0; as demais em `max da anterior + 1`. */
  minMin: number
  /** Carga semanal máxima (min), inclusiva; `null` = sem limite (só a última). */
  maxMin: number | null
  /** PDFulls novos por semana (continuações não contam). */
  tetoPdf: number
  /** Teto só vale para planos com a regra da ref. rev. 23 (motor >= 3.2.0); em planos 3.1 a faixa é pulada no TETO. */
  soRegra23: boolean
  /** Faixa "equilibrada": retornos limitados por dia, questões/dia e PDFlashes/dia do bloco `equilibrio`. */
  equilibra: boolean
  revisaoModo: ModoRevisao
  /** Periodicidade do ciclo (semanas) quando `revisaoModo = ciclo`; `null` = herda `revisao.cicloSemanas`. */
  cicloSemanas: number | null
  /** Opções oferecidas p/ a semana especial por desempenho; `null` = herda `revisao.opcoesNovas`. */
  opcoesNovas: number[] | null
  /** Periodicidade padrão da semana especial; `null` = herda `revisao.padrao`. */
  padrao: number | null
  modoQuestoes: ModoQuestoes
  /** Parâmetros sobrescritos nesta faixa (só o que difere do global). `{}` = herda tudo. */
  overrides: OverridesFaixa
}

export const FAIXAS_PADRAO: FaixaCarga[] = [
  { id: 'f1', nome: '10h–14h30', minMin: 0, maxMin: 870, tetoPdf: 3, soRegra23: true, equilibra: false, revisaoModo: 'ciclo', cicloSemanas: null, opcoesNovas: null, padrao: null, modoQuestoes: 'revisao', overrides: {} },
  { id: 'f2', nome: '15h–24h30', minMin: 871, maxMin: 1470, tetoPdf: 4, soRegra23: false, equilibra: false, revisaoModo: 'ciclo', cicloSemanas: null, opcoesNovas: null, padrao: null, modoQuestoes: 'revisao_pdf', overrides: {} },
  { id: 'f3', nome: '25h–35h', minMin: 1471, maxMin: 2100, tetoPdf: 5, soRegra23: false, equilibra: true, revisaoModo: 'desempenho', cicloSemanas: null, opcoesNovas: null, padrao: null, modoQuestoes: 'livre', overrides: {} },
  { id: 'f4', nome: 'Acima de 35h', minMin: 2101, maxMin: null, tetoPdf: 6, soRegra23: false, equilibra: false, revisaoModo: 'desempenho', cicloSemanas: null, opcoesNovas: null, padrao: null, modoQuestoes: 'livre', overrides: {} },
]

export const MAX_FAIXAS = 8
export const MAX_MINUTOS_SEMANA = 10080

/** Índice da faixa que contém a carga semanal (min). Cargas entre faixas (fracionárias) caem na faixa seguinte ao último `maxMin` coberto. */
export function indiceDaFaixa(faixas: readonly FaixaCarga[], minutos: number): number {
  for (let k = 0; k < faixas.length; k++) { const m = faixas[k].maxMin; if (m == null || minutos <= m) return k }
  return Math.max(0, faixas.length - 1)
}
export const faixaPorMinutos = (faixas: readonly FaixaCarga[], minutos: number): FaixaCarga => faixas[indiceDaFaixa(faixas, minutos)]
/** Classe legada (1/2/3) usada no fluxo diário do motor e nas restrições. */
export const classeDaFaixa = (f: Pick<FaixaCarga, 'modoQuestoes'>): 1 | 2 | 3 => (f.modoQuestoes === 'revisao' ? 1 : f.modoQuestoes === 'revisao_pdf' ? 2 : 3)
/** Faixa que vale para o TETO: planos sem a regra 23 pulam as faixas `soRegra23`. */
export function faixaDoTeto(faixas: readonly FaixaCarga[], minutos: number, regra23: boolean): FaixaCarga {
  for (const f of faixas) {
    if (f.soRegra23 && !regra23) continue
    if (f.maxMin == null || minutos <= f.maxMin) return f
  }
  return faixas[faixas.length - 1]
}

/** Texto curto de uma carga em minutos ("14h30", "25h"). */
export function textoHoras(min: number): string {
  const h = Math.floor(min / 60), m = Math.round(min % 60)
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}
/** Descrição do intervalo: "até 14h30", "de 15h a 24h30", "acima de 35h". */
export function textoIntervalo(f: FaixaCarga, k: number, todas: readonly FaixaCarga[]): string {
  const ini = k === 0 ? 0 : (todas[k - 1].maxMin ?? 0)
  if (f.maxMin == null) return `acima de ${textoHoras(ini)}`
  if (k === 0) return `até ${textoHoras(f.maxMin)}`
  return `de ${textoHoras(f.minMin)} a ${textoHoras(f.maxMin)}`
}

/** Valida a lista de faixas (mensagens pt-BR, vazio = ok). Usada pela UI (ao vivo) e pelo zod do servidor. */
export function validarFaixas(faixas: readonly FaixaCarga[]): string[] {
  const e: string[] = []
  if (!faixas.length) return ['Informe ao menos uma faixa de carga.']
  if (faixas.length > MAX_FAIXAS) e.push(`No máximo ${MAX_FAIXAS} faixas.`)
  const ids = new Set<string>()
  faixas.forEach((f, k) => {
    const nome = f.nome?.trim() || `Faixa ${k + 1}`
    if (!f.nome?.trim()) e.push(`Faixa ${k + 1}: informe o nome.`)
    if (!f.id || ids.has(f.id)) e.push(`${nome}: identificador repetido ou vazio.`)
    ids.add(f.id)
    const ultima = k === faixas.length - 1
    if (k === 0 && f.minMin !== 0) e.push(`${nome}: a primeira faixa precisa começar em 0 min.`)
    if (k > 0) {
      const ant = faixas[k - 1].maxMin
      if (ant == null) e.push(`${faixas[k - 1].nome}: só a última faixa pode ficar sem limite superior.`)
      else if (f.minMin < ant + 1) e.push(`${nome}: sobreposição com a faixa anterior (começa em ${f.minMin} min, a anterior vai até ${ant} min).`)
      else if (f.minMin > ant + 1) e.push(`${nome}: lacuna entre a faixa anterior (até ${ant} min) e esta (a partir de ${f.minMin} min).`)
    }
    if (ultima && f.maxMin != null) e.push(`${nome}: a última faixa precisa ficar sem limite superior (acima de ${f.minMin} min).`)
    if (!ultima && f.maxMin == null) e.push(`${nome}: faixa intermediária precisa de um limite superior.`)
    if (f.maxMin != null && f.maxMin < f.minMin) e.push(`${nome}: o máximo (${f.maxMin} min) é menor que o mínimo (${f.minMin} min).`)
    if (!Number.isInteger(f.tetoPdf) || f.tetoPdf < 1 || f.tetoPdf > 12) e.push(`${nome}: o teto de PDFull deve ser de 1 a 12.`)
    if (f.cicloSemanas != null && (f.cicloSemanas < 2 || f.cicloSemanas > 12)) e.push(`${nome}: periodicidade do ciclo deve ser de 2 a 12 semanas.`)
    if (f.opcoesNovas && !f.opcoesNovas.length) e.push(`${nome}: informe ao menos uma opção de periodicidade (ou herde a global).`)
    if (f.padrao != null && f.opcoesNovas && !f.opcoesNovas.includes(f.padrao)) e.push(`${nome}: a periodicidade padrão (${f.padrao}) não está entre as opções da faixa.`)
  })
  return e
}

/** Faixa efetiva do ciclo/opções/padrão (herda o global quando `null`). */
export const cicloDaFaixa = (f: Pick<FaixaCarga, 'cicloSemanas'>, R: Pick<RegrasMotor, 'revisao'>): number => f.cicloSemanas ?? R.revisao.cicloSemanas
export const opcoesDaFaixa = (f: Pick<FaixaCarga, 'opcoesNovas'>, R: Pick<RegrasMotor, 'revisao'>): number[] => f.opcoesNovas ?? R.revisao.opcoesNovas
export function padraoDaFaixa(f: Pick<FaixaCarga, 'padrao' | 'opcoesNovas'>, R: Pick<RegrasMotor, 'revisao'>): number {
  const op = opcoesDaFaixa(f, R)
  const p = f.padrao ?? R.revisao.padrao
  return op.includes(p) ? p : (op.includes(R.revisao.padrao) ? R.revisao.padrao : op[op.length - 1])
}

/**
 * Aplica EM LUGAR (mutando `vivo`) as seções da faixa sobre a base: `vivo[sec] = { ...base[sec], ...faixa.overrides[sec] }`.
 * Sem override numa seção, `vivo[sec]` volta a ser `base[sec]`. O motor usa um `vivo` próprio (clone) para que as closures vejam a faixa da semana corrente.
 */
export function aplicarFaixaEmRegras(vivo: RegrasMotor, base: RegrasMotor, faixa: FaixaCarga | null | undefined): void {
  const v = vivo as unknown as Record<string, unknown>, b = base as unknown as Record<string, Record<string, unknown>>
  for (const s of SECOES_OVERRIDE) {
    const o = faixa?.overrides?.[s] as Record<string, unknown> | undefined
    v[s] = o && Object.keys(o).length ? { ...b[s], ...o } : b[s]
  }
}
/** Alguma faixa tem override? (o motor só clona/alterna regras quando há.) */
export const temOverrides = (faixas: readonly FaixaCarga[]): boolean => faixas.some((f) => SECOES_OVERRIDE.some((s) => f.overrides?.[s] && Object.keys(f.overrides[s] as object).length))
/** Regras efetivas de uma faixa (cópia rasa): base + overrides da faixa. */
export function regrasDaFaixa(base: RegrasMotor, faixa: FaixaCarga | null | undefined): RegrasMotor {
  const c = { ...base } as RegrasMotor
  aplicarFaixaEmRegras(c, base, faixa)
  return c
}

/** Cópia "viva" das regras para o motor alternar as seções por faixa/semana (a base fica guardada em `__base`, não enumerável). */
export function criarRegrasVivas(base: RegrasMotor): RegrasMotor {
  const vivo = { ...base } as RegrasMotor
  Object.defineProperty(vivo, '__base', { value: base, enumerable: false })
  return vivo
}
/** Regras-base de um objeto vivo (ou o próprio objeto, se não for vivo). */
export const baseDeRegras = (R: RegrasMotor): RegrasMotor => ((R as unknown as { __base?: RegrasMotor }).__base ?? R)
