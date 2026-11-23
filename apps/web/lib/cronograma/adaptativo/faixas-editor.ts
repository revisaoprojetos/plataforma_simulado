/**
 * Helpers PUROS do editor visual de faixas de carga (aba "Faixas e limites"). Sem I/O, sem Date/Math.random.
 * Todas as funções devolvem NOVOS arrays/objetos (não mutam a entrada). A validação oficial continua em `validarFaixas` + servidor.
 */
import { SECOES_OVERRIDE, MAX_FAIXAS, MAX_MINUTOS_SEMANA, textoHoras, type FaixaCarga, type OverridesFaixa, type SecaoOverride } from './faixas-carga'

export const PASSO_MIN = 30
/** Escala mínima da linha do tempo (h) — a última faixa (aberta) ocupa o resto. */
export const ESCALA_MIN_H = 50

const clonar = (f: FaixaCarga): FaixaCarga => ({ ...f, opcoesNovas: f.opcoesNovas ? [...f.opcoesNovas] : null, overrides: JSON.parse(JSON.stringify(f.overrides ?? {})) as OverridesFaixa })
const ate30 = (m: number) => Math.ceil(m / PASSO_MIN) * PASSO_MIN

/** Nome automático da faixa k conforme seus limites ("10h–14h30", "Acima de 35h"). */
export function nomeAutomatico(faixas: readonly FaixaCarga[], k: number): string {
  const f = faixas[k]
  if (!f) return ''
  if (f.maxMin == null) return `Acima de ${textoHoras(k === 0 ? 0 : (faixas[k - 1].maxMin ?? 0))}`
  const ini = k === 0 ? 0 : ate30(f.minMin)
  return `${textoHoras(ini)}–${textoHoras(f.maxMin)}`
}

/** Mantém o encadeamento (min = max anterior + 1; 1ª = 0) e renomeia faixas cujo nome ainda era o automático da versão `antes`. */
function religar(depois: FaixaCarga[], antes: readonly FaixaCarga[] | null): FaixaCarga[] {
  const out = depois.map(clonar)
  out.forEach((f, k) => { f.minMin = k === 0 ? 0 : (out[k - 1].maxMin ?? 0) + 1 })
  if (antes) out.forEach((f, k) => {
    const ant = antes.find((a) => a.id === f.id), ia = ant ? antes.indexOf(ant) : -1
    if (ant && (!ant.nome.trim() || ant.nome === nomeAutomatico(antes, ia))) f.nome = nomeAutomatico(out, k)
  })
  return out
}

/** Troca o limite máximo da faixa k (a última não tem) e ajusta o mínimo da seguinte. Limita ao intervalo válido. */
export function ajustarMaximo(faixas: readonly FaixaCarga[], k: number, novoMax: number): FaixaCarga[] {
  if (k < 0 || k >= faixas.length - 1 || !Number.isFinite(novoMax)) return faixas.map(clonar)
  const piso = faixas[k].minMin, prox = faixas[k + 1].maxMin
  const teto = prox == null ? MAX_MINUTOS_SEMANA : prox - 1
  const v = Math.max(piso, Math.min(teto, Math.round(novoMax)))
  const out = faixas.map(clonar)
  out[k].maxMin = v
  return religar(out, faixas)
}

/** Divide a última faixa: ela ganha limite (+5h) e nasce uma nova faixa aberta depois dela. Respeita MAX_FAIXAS. */
export function adicionarFaixa(faixas: readonly FaixaCarga[]): FaixaCarga[] {
  if (!faixas.length || faixas.length >= MAX_FAIXAS) return faixas.map(clonar)
  const out = faixas.map(clonar), ult = out[out.length - 1]
  const base = ult.minMin > 0 ? ult.minMin - 1 : 0
  const novoMax = Math.min(base + (ult.minMin === 0 ? 600 : 300), MAX_MINUTOS_SEMANA - PASSO_MIN)
  const usados = new Set(out.map((f) => f.id))
  let n = out.length + 1
  while (usados.has(`f${n}`)) n++
  const nova = clonar(ult)
  nova.id = `f${n}`
  nova.maxMin = null
  nova.tetoPdf = Math.min(12, ult.tetoPdf + 1)
  ult.maxMin = novoMax
  const lista = religar([...out, nova], faixas)
  lista[lista.length - 1].nome = nomeAutomatico(lista, lista.length - 1)
  const iu = lista.length - 2
  if (!faixas[iu].nome.trim() || faixas[iu].nome === nomeAutomatico(faixas, iu)) lista[iu].nome = nomeAutomatico(lista, iu)
  return lista
}

/** Remove a faixa k (mínimo 1): a vizinha absorve o intervalo. Se era a última, a anterior fica aberta. */
export function removerFaixa(faixas: readonly FaixaCarga[], k: number): FaixaCarga[] {
  if (faixas.length <= 1 || k < 0 || k >= faixas.length) return faixas.map(clonar)
  const out = faixas.map(clonar)
  const eraUltima = k === out.length - 1
  out.splice(k, 1)
  if (eraUltima) out[out.length - 1].maxMin = null
  return religar(out, faixas)
}

/** Minutos ↔ horas+minutos (entrada separada). */
export const dividirMinutos = (min: number): { h: number; m: number } => ({ h: Math.floor(min / 60), m: min % 60 })
export const juntarMinutos = (h: number, m: number): number => Math.max(0, Math.round(h) * 60 + Math.round(m))

// ── linha do tempo ───────────────────────────────────────────────────────────────────────────────────
export interface SegmentoLinha { k: number; ini: number; fim: number; pct: number; aberta: boolean }
/** Escala (min) da linha do tempo: ≥ 50h e sempre com folga depois do último limite. */
export function escalaLinha(faixas: readonly FaixaCarga[]): number {
  const ult = faixas.length ? (faixas[faixas.length - 1].minMin) : 0
  return Math.max(ESCALA_MIN_H * 60, Math.ceil((ult + 10 * 60) / 60) * 60)
}
/** Segmentos proporcionais ao intervalo (a última faixa vai até o fim da escala). `pct` soma 100. */
export function segmentosLinha(faixas: readonly FaixaCarga[]): SegmentoLinha[] {
  const esc = escalaLinha(faixas)
  return faixas.map((f, k) => {
    const ini = k === 0 ? 0 : (faixas[k - 1].maxMin ?? 0)
    const fim = f.maxMin ?? esc
    return { k, ini, fim, pct: Math.max(0, (Math.max(fim, ini) - ini) / esc) * 100, aberta: f.maxMin == null }
  })
}

// ── overrides ────────────────────────────────────────────────────────────────────────────────────────
/** "limitesDia.questoes" → { secao, campo } (só 2 níveis; null se a seção não aceita override ou o caminho é aninhado). */
export function separarCaminhoOverride(path: string): { secao: SecaoOverride; campo: string } | null {
  const i = path.indexOf('.')
  if (i < 0) return null
  const secao = path.slice(0, i), campo = path.slice(i + 1)
  if (!(SECOES_OVERRIDE as readonly string[]).includes(secao) || !campo || campo.includes('.')) return null
  return { secao: secao as SecaoOverride, campo }
}
export function lerOverride(f: FaixaCarga, path: string): unknown {
  const p = separarCaminhoOverride(path)
  if (!p) return undefined
  return (f.overrides?.[p.secao] as Record<string, unknown> | undefined)?.[p.campo]
}
export const temOverride = (f: FaixaCarga, path: string): boolean => lerOverride(f, path) !== undefined
/** Define (ou, com `undefined`, limpa) o override do campo na faixa k; remove a seção vazia. */
export function definirOverride(faixas: readonly FaixaCarga[], k: number, path: string, valor: unknown): FaixaCarga[] {
  const p = separarCaminhoOverride(path)
  const out = faixas.map(clonar)
  if (!p || !out[k]) return out
  const ov = out[k].overrides as Record<string, Record<string, unknown> | undefined>
  const sec = { ...(ov[p.secao] ?? {}) }
  if (valor === undefined) delete sec[p.campo]; else sec[p.campo] = valor
  if (Object.keys(sec).length) ov[p.secao] = sec; else delete ov[p.secao]
  return out
}
export function contarOverrides(f: FaixaCarga): number {
  let n = 0
  for (const s of SECOES_OVERRIDE) { const o = f.overrides?.[s]; if (o) n += Object.keys(o).length }
  return n
}

const ROTULO_CAMPO_FAIXA: Record<string, string> = {
  nome: 'nome', minMin: 'carga mínima (min)', maxMin: 'carga máxima (min)', tetoPdf: 'teto de PDFull novo/semana', soRegra23: 'teto só com a regra 23', equilibra: 'equilibrada', revisaoModo: 'modo de revisão',
  cicloSemanas: 'periodicidade do ciclo', opcoesNovas: 'opções de periodicidade', padrao: 'periodicidade padrão', modoQuestoes: 'modo de questões', id: 'identificador',
}
/** Rótulo legível de caminhos de faixa (`faixas.N.campo` / `faixas.N.overrides.secao.campo`); o resto delega a `fallback`. */
export function rotuloDiffFaixa(path: string, fallback: (p: string) => string, nomeCampo: (p: string) => string | undefined, nomeFaixa?: (k: number) => string): string {
  const m = /^faixas\.(\d+)\.(.+)$/.exec(path)
  if (!m) return fallback(path)
  const k = Number(m[1]), resto = m[2], nome = nomeFaixa?.(k) ?? `Faixa ${k + 1}`
  if (resto.startsWith('overrides.')) {
    const sub = resto.slice('overrides.'.length)
    return `${nome} (override): ${nomeCampo(sub) ?? sub}`
  }
  return `${nome}: ${ROTULO_CAMPO_FAIXA[resto] ?? resto}`
}
