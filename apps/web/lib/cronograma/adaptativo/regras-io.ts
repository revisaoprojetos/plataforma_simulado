/**
 * EXPORTAR / IMPORTAR as regras do motor em JSON. PURO (sem I/O, sem relógio implícito): a data de exportação vem de fora.
 * Import: limite de tamanho, formato conhecido, chaves perigosas rejeitadas, validação oficial (`validarRegras`) e diff
 * (`diffRegras`) contra as regras vigentes. Nada é gravado aqui — quem aplica é a action `salvarRegrasComTrava`.
 */
import { hashRegras, deltaDoPadrao, normalizarRegras, type RegrasMotor } from './regras'
import { validarRegras } from './regras-validacao'
import { diffRegras, type DifCampo } from './regras-campos'

export const FORMATO_REGRAS = 'adaptativo-regras'
export const VERSAO_FORMATO_REGRAS = 1
export const LIMITE_BYTES_IMPORTACAO = 200 * 1024
const PROFUNDIDADE_MAX = 24
const CHAVES_PERIGOSAS = new Set(['__proto__', 'constructor', 'prototype'])

export interface ArquivoRegras {
  formato: typeof FORMATO_REGRAS
  versaoFormato: number
  exportadoEm: string
  hash: string
  delta: Record<string, unknown>
  regras: RegrasMotor
}

/** Gera o objeto de exportação. `exportadoEm` (ISO) é passado pelo chamador. */
export function exportarRegras(regras: unknown, meta: { exportadoEm: string }): ArquivoRegras {
  const n = normalizarRegras(regras)
  return { formato: FORMATO_REGRAS, versaoFormato: VERSAO_FORMATO_REGRAS, exportadoEm: meta.exportadoEm, hash: hashRegras(n), delta: deltaDoPadrao(n), regras: n }
}

export interface ResultadoImportacao {
  ok: boolean
  erros: string[]
  avisos: string[]
  regras: RegrasMotor | null
  diff: DifCampo[]
  /** hash das regras importadas já normalizadas. */
  hash: string | null
}
const falha = (...erros: string[]): ResultadoImportacao => ({ ok: false, erros, avisos: [], regras: null, diff: [], hash: null })
const ehObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)

/** Procura chave perigosa / profundidade excessiva. Devolve a mensagem de erro ou null. */
export function acharChavePerigosa(v: unknown, prof = 0): string | null {
  if (prof > PROFUNDIDADE_MAX) return 'O arquivo tem aninhamento profundo demais.'
  if (Array.isArray(v)) { for (const x of v) { const e = acharChavePerigosa(x, prof + 1); if (e) return e } return null }
  if (ehObj(v)) {
    for (const k of Object.keys(v)) {
      if (CHAVES_PERIGOSAS.has(k)) return `Chave não permitida no arquivo: "${k}".`
      const e = acharChavePerigosa(v[k], prof + 1); if (e) return e
    }
  }
  return null
}

/** Mescla `parcial` sobre `base` (objetos fundem; arrays e escalares substituem). Ignora chaves perigosas. Não muta a entrada. */
export function mesclarParcial(base: unknown, parcial: unknown): unknown {
  if (!ehObj(parcial)) return parcial
  const out: Record<string, unknown> = ehObj(base) ? { ...base } : {}
  for (const [k, v] of Object.entries(parcial)) {
    if (CHAVES_PERIGOSAS.has(k)) continue
    out[k] = ehObj(v) ? mesclarParcial(out[k], v) : v
  }
  return out
}

/** Interpreta texto/objeto importado. `vigentes` = regras em vigor (para o diff). */
export function importarRegras(entrada: string | unknown, vigentes: unknown): ResultadoImportacao {
  let obj: unknown = entrada
  if (typeof entrada === 'string') {
    if (entrada.length > LIMITE_BYTES_IMPORTACAO) return falha('Arquivo grande demais (máximo de 200 KB).')
    if (!entrada.trim()) return falha('Cole ou envie o conteúdo do arquivo de regras.')
    try { obj = JSON.parse(entrada) } catch { return falha('JSON inválido: não foi possível ler o conteúdo.') }
  } else {
    let tam = 0
    try { tam = JSON.stringify(entrada)?.length ?? 0 } catch { return falha('Conteúdo inválido.') }
    if (tam > LIMITE_BYTES_IMPORTACAO) return falha('Arquivo grande demais (máximo de 200 KB).')
  }
  if (!ehObj(obj)) return falha('Formato inválido: esperado um objeto JSON.')
  const perigo = acharChavePerigosa(obj)
  if (perigo) return falha(perigo)
  if (obj.formato !== FORMATO_REGRAS) return falha('Formato desconhecido: este não é um arquivo de regras do cronograma adaptativo.')
  const vf = Number(obj.versaoFormato)
  if (!Number.isInteger(vf) || vf < 1 || vf > VERSAO_FORMATO_REGRAS) return falha(`Versão de formato não suportada (${String(obj.versaoFormato)}).`)
  const avisos: string[] = []
  let cru: unknown
  if (ehObj(obj.regras)) cru = obj.regras
  else if (ehObj(obj.delta)) { cru = obj.delta; avisos.push('O arquivo não trazia as regras completas; usado o delta contra o padrão.') }
  else return falha('O arquivo não contém "regras" nem "delta".')
  const v = validarRegras(cru)
  if (!v.ok || !v.regras) return falha(...(v.erros.length ? v.erros : ['Regras inválidas.']))
  const hash = hashRegras(v.regras)
  if (typeof obj.hash === 'string' && obj.hash && obj.hash !== hash) avisos.push('O hash do arquivo não confere com o conteúdo (arquivo editado à mão ou de outra versão do motor).')
  if (v.avisos?.length) avisos.push(...v.avisos)
  return { ok: true, erros: [], avisos, regras: v.regras, diff: diffRegras(vigentes, v.regras), hash }
}

/** Nome de arquivo sugerido para o download. */
export const nomeArquivoRegras = (hash: string, dia: string) => `regras-adaptativo-${dia}-${hash.slice(0, 8)}.json`
