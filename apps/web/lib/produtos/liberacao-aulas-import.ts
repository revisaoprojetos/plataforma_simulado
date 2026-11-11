// Leitura (parser) da planilha "Liberação de aulas — primeira aparição" (.xlsx) → linhas tipadas. Só lê o arquivo;
// o casamento com as aulas do produto é de liberacao-aulas-match.ts e a gravação é da rota/ação do admin.
// Cabeçalhos são reconhecidos por palavras-chave normalizadas (o "−" unicode do título não importa) com
// fallback por POSIÇÃO (Nº, Data, Dia, Matéria, Nº aula, Título, Cronograma, Semana, Observação, Data original).

import { normalizar } from './liberacao-aulas-match'

export interface LinhaPlanilha {
  ordem: number
  dataLiberacao: string // YYYY-MM-DD
  disciplina: string
  numeroAula: number | null
  titulo: string
  cronogramas: string | null
  semana: number | null
  observacao: string | null
  dataOriginal: string | null
}
export interface LeituraPlanilha { linhas: LinhaPlanilha[]; invalidas: Array<{ linha: number; motivo: string }> }

const TAM_MAX = 8 * 1024 * 1024
export const LIMITE_PLANILHA = TAM_MAX

type CampoCol = 'ordem' | 'data' | 'dia' | 'materia' | 'numero' | 'titulo' | 'cronogramas' | 'semana' | 'obs' | 'original'
const POSICAO: CampoCol[] = ['ordem', 'data', 'dia', 'materia', 'numero', 'titulo', 'cronogramas', 'semana', 'obs', 'original']

function campoDoCabecalho(h: string): CampoCol | null {
  const n = normalizar(h)
  if (!n) return null
  if (n.includes('data original')) return 'original'
  if (n.includes('liberacao') && n.includes('data')) return 'data'
  if (n.includes('dia da semana')) return 'dia'
  if (n.includes('semana no cronograma') || n === 'semana') return 'semana'
  if (n.includes('cronograma onde') || n.includes('onde aparece')) return 'cronogramas'
  if (n.includes('materia') || n.includes('disciplina')) return 'materia'
  if (n.includes('titulo')) return 'titulo'
  if (n.includes('observac')) return 'obs'
  if (/\baula\b/.test(n) && /^n\b/.test(n)) return 'numero'
  if (n === 'n' || n === 'no' || n === 'num' || n === 'numero') return 'ordem'
  return null
}

function texto(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }>; hyperlink?: string }
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim()
    if (o.result != null) return texto(o.result)
    if (typeof o.text === 'string') return o.text.trim()
    if (v instanceof Date) return v.toISOString()
    return ''
  }
  return String(v).trim()
}
const inteiro = (v: unknown): number | null => { const n = Number(texto(v).replace(',', '.')); return Number.isFinite(n) && texto(v) !== '' ? Math.trunc(n) : null }

/** Aceita Date, serial do Excel, "dd/mm/aaaa" e "aaaa-mm-dd". Datas civis: o Excel grava meia-noite UTC. */
export function paraDataISO(v: unknown): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString().slice(0, 10)
  if (typeof v === 'number') return Number.isFinite(v) && v > 20000 && v < 80000 ? new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10) : null
  const t = texto(v)
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}
const dataValida = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s }

export async function lerPlanilhaLiberacao(buf: ArrayBuffer | Buffer): Promise<LeituraPlanilha> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as ArrayBuffer)
  const ws = wb.worksheets.find((w) => normalizar(w.name).includes('liberacao')) ?? wb.worksheets[0]
  if (!ws) return { linhas: [], invalidas: [{ linha: 0, motivo: 'A planilha não tem abas.' }] }

  // Mapa coluna → campo: pelo cabeçalho da 1ª linha; o que não for reconhecido cai na posição padrão.
  const mapa = new Map<CampoCol, number>()
  const cab = ws.getRow(1)
  for (let c = 1; c <= Math.max(10, cab.cellCount); c++) {
    const campo = campoDoCabecalho(texto(cab.getCell(c).value))
    if (campo && !mapa.has(campo)) mapa.set(campo, c)
  }
  POSICAO.forEach((campo, i) => { if (!mapa.has(campo)) mapa.set(campo, i + 1) })
  const col = (r: ReturnType<typeof ws.getRow>, c: CampoCol) => r.getCell(mapa.get(c)!).value

  const linhas: LinhaPlanilha[] = []
  const invalidas: LeituraPlanilha['invalidas'] = []
  const vistos = new Set<number>()
  ws.eachRow({ includeEmpty: false }, (r, i) => {
    if (i === 1) return
    const disciplina = texto(col(r, 'materia'))
    const titulo = texto(col(r, 'titulo'))
    if (!disciplina && !titulo) return
    const ordem = inteiro(col(r, 'ordem')) ?? i - 1
    const data = paraDataISO(col(r, 'data'))
    if (!disciplina || !titulo) return void invalidas.push({ linha: i, motivo: 'faltou matéria ou título' })
    if (!data || !dataValida(data)) return void invalidas.push({ linha: i, motivo: 'data de liberação ausente ou inválida' })
    if (vistos.has(ordem)) return void invalidas.push({ linha: i, motivo: `Nº ${ordem} repetido` })
    vistos.add(ordem)
    const original = paraDataISO(col(r, 'original'))
    linhas.push({
      ordem, dataLiberacao: data, disciplina, numeroAula: inteiro(col(r, 'numero')), titulo,
      cronogramas: texto(col(r, 'cronogramas')) || null, semana: inteiro(col(r, 'semana')),
      observacao: texto(col(r, 'obs')) || null, dataOriginal: original && dataValida(original) ? original : null,
    })
  })
  return { linhas, invalidas }
}
