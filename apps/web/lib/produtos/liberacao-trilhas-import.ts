// Importação da 2ª aba "Data em cada cronograma" da planilha de liberação: parser (xlsx → linhas × trilhas) e
// PLANO puro (casamento com as aulas já importadas pela 1ª aba, por Nº = `ordem`, e prévia do que será gravado).
// Sem I/O de banco: quem grava é a rota de API. Reaproveita normalizar/similaridade do casador existente.
//
// Datas: as datas desta aba da planilha já vêm "antecipadas" (liberação = data do cronograma − 28 dias). Para o motor
// (liberação = data_cronograma − offset) gravamos data_cronograma = data da planilha + `descontoDias` (padrão 28).

import { normalizar, similaridade } from './liberacao-aulas-match'
import { paraDataISO } from './liberacao-aulas-import'

export const DESCONTO_PADRAO = 28
export const OFFSET_NOVA_TRILHA = 28
export const LIMITE_PLANILHA_TRILHAS = 8 * 1024 * 1024

export interface LinhaTrilhaPlanilha {
  linha: number
  ordem: number | null
  disciplina: string
  numeroAula: number | null
  titulo: string
  /** nome da trilha → data (YYYY-MM-DD) como está na planilha; null = célula vazia (aula não existe na trilha). */
  datas: Record<string, string | null>
}
export interface LeituraTrilhas {
  aba: string
  trilhas: string[]
  linhas: LinhaTrilhaPlanilha[]
  invalidas: Array<{ linha: number; motivo: string }>
  /** Início do cronograma por nome de trilha, lido da aba "Premissas…" (ou o padrão). */
  inicios: Record<string, string>
}

const INICIO_PADRAO = '2026-11-16'
const INICIO_COMPLEMENTARES = '2027-07-12'

function texto(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') {
    const o = v as { text?: string; result?: unknown; richText?: Array<{ text: string }> }
    if (v instanceof Date) return v.toISOString()
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim()
    if (o.result != null) return texto(o.result)
    if (typeof o.text === 'string') return o.text.trim()
    return ''
  }
  return String(v).trim()
}
const inteiro = (v: unknown): number | null => { const t = texto(v).replace(',', '.'); const n = Number(t); return t !== '' && Number.isFinite(n) ? Math.trunc(n) : null }
const dataValida = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s }

export function somaDiasISO(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + dias))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}

type Papel = 'ordem' | 'materia' | 'numero' | 'titulo'
function papelDoCabecalho(h: string): Papel | null {
  const n = normalizar(h)
  if (!n) return null
  if (n.includes('titulo')) return 'titulo'
  if (n === 'materia' || n === 'disciplina' || n === 'materia disciplina') return 'materia'
  if (/\baula\b/.test(n) && /^n\b/.test(n)) return 'numero'
  if (n === 'n' || n === 'no' || n === 'num' || n === 'numero') return 'ordem'
  return null
}

function dataDoTexto(t: string): string | null {
  const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t)
  if (!m) return null
  const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return dataValida(iso) ? iso : null
}

export async function lerPlanilhaTrilhas(buf: ArrayBuffer | Buffer): Promise<LeituraTrilhas> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf as ArrayBuffer)
  const vazio: LeituraTrilhas = { aba: '', trilhas: [], linhas: [], invalidas: [], inicios: {} }
  const ws = wb.worksheets.find((w) => normalizar(w.name).includes('cada cronograma')) ?? (wb.worksheets.length > 1 ? wb.worksheets[1] : wb.worksheets[0])
  if (!ws) return { ...vazio, invalidas: [{ linha: 0, motivo: 'A planilha não tem abas.' }] }

  const cab = ws.getRow(1)
  const papeis = new Map<Papel, number>()
  const colTrilha: Array<{ col: number; nome: string }> = []
  for (let c = 1; c <= Math.max(cab.cellCount, 6); c++) {
    const h = texto(cab.getCell(c).value)
    if (!h) continue
    const p = papelDoCabecalho(h)
    if (p) { if (!papeis.has(p)) papeis.set(p, c) } else colTrilha.push({ col: c, nome: h.replace(/\s+/g, ' ').trim() })
  }
  if (!papeis.has('materia') || !papeis.has('titulo') || !colTrilha.length) {
    return { ...vazio, aba: ws.name, invalidas: [{ linha: 1, motivo: 'Não reconheci o cabeçalho (esperado: Nº, Matéria, Nº da aula, Título da aula e uma coluna por cronograma).' }] }
  }
  const get = (r: ReturnType<typeof ws.getRow>, p: Papel) => (papeis.has(p) ? r.getCell(papeis.get(p)!).value : null)

  // início por trilha: aba "Premissas…"
  const inicios: Record<string, string> = {}
  let inicioGeral = INICIO_PADRAO, inicioCompl = INICIO_COMPLEMENTARES
  const wsPrem = wb.worksheets.find((w) => normalizar(w.name).includes('premissa'))
  if (wsPrem) {
    wsPrem.eachRow({ includeEmpty: false }, (r) => {
      const rot = normalizar(texto(r.getCell(2).value))
      const d = dataDoTexto(texto(r.getCell(3).value))
      if (!d) return
      if (rot.includes('inicio dos cronogramas')) inicioGeral = d
      else if (rot.includes('inicio do complementares')) inicioCompl = d
    })
  }
  for (const t of colTrilha) inicios[t.nome] = normalizar(t.nome).includes('complementar') ? inicioCompl : inicioGeral

  const linhas: LinhaTrilhaPlanilha[] = []
  const invalidas: LeituraTrilhas['invalidas'] = []
  ws.eachRow({ includeEmpty: false }, (r, i) => {
    if (i === 1) return
    const disciplina = texto(get(r, 'materia'))
    const titulo = texto(get(r, 'titulo'))
    if (!disciplina && !titulo) return
    if (!disciplina || !titulo) return void invalidas.push({ linha: i, motivo: 'faltou matéria ou título' })
    const datas: Record<string, string | null> = {}
    for (const t of colTrilha) {
      const bruto = r.getCell(t.col).value
      if (bruto == null || texto(bruto) === '') { datas[t.nome] = null; continue }
      const iso = paraDataISO(bruto)
      if (!iso || !dataValida(iso)) { invalidas.push({ linha: i, motivo: `data inválida em “${t.nome}”` }); datas[t.nome] = null; continue }
      datas[t.nome] = iso
    }
    linhas.push({ linha: i, ordem: inteiro(get(r, 'ordem')), disciplina, numeroAula: inteiro(get(r, 'numero')), titulo, datas })
  })
  return { aba: ws.name, trilhas: colTrilha.map((t) => t.nome), linhas, invalidas, inicios }
}

// ── plano / prévia (PURO) ──
export interface AulaExistente { id: string; ordem: number; disciplina: string; titulo: string }
export interface TrilhaExistente { id: string; nome: string; offsetDias: number; inicio: string | null }
export interface CelulaExistente { trilhaId: string; aulaId: string; dataCronograma: string | null; dataManual: string | null }

export interface CelulaPlano { trilhaNome: string; aulaId: string; ordem: number; dataCronograma: string | null; situacao: 'nova' | 'alterada' | 'igual' | 'removida' }
export interface TrilhaPlano { nome: string; existenteId: string | null; inicio: string | null; offsetDias: number; celulasComData: number }
export interface LinhaPlano {
  linha: LinhaTrilhaPlanilha
  aulaId: string | null
  aulaOrdem: number | null
  aulaTitulo: string | null
  casou: 'ordem' | 'titulo' | 'nenhum'
}
export interface PlanoImportacao {
  linhas: LinhaPlano[]
  trilhas: TrilhaPlano[]
  celulas: CelulaPlano[]
  descontoDias: number
  resumo: {
    linhasLidas: number; linhasCasadas: number; linhasSemAula: number
    celulasComData: number; celulasVazias: number
    novas: number; alteradas: number; iguais: number; removidas: number; manuaisPreservadas: number
  }
}

export function planejarImportacaoTrilhas(p: {
  leitura: LeituraTrilhas
  descontoDias: number
  aulas: AulaExistente[]
  trilhas: TrilhaExistente[]
  celulas: CelulaExistente[]
}): PlanoImportacao {
  const desc = Math.max(0, Math.trunc(p.descontoDias || 0))
  const porOrdem = new Map(p.aulas.map((a) => [a.ordem, a]))
  const porChave = new Map(p.aulas.map((a) => [`${normalizar(a.disciplina)}|${normalizar(a.titulo)}`, a]))
  const trilhaPorNome = new Map(p.trilhas.map((t) => [normalizar(t.nome), t]))
  const celulaPor = new Map(p.celulas.map((c) => [`${c.trilhaId}|${c.aulaId}`, c]))

  const trilhas: TrilhaPlano[] = p.leitura.trilhas.map((nome) => {
    const ex = trilhaPorNome.get(normalizar(nome))
    return { nome, existenteId: ex?.id ?? null, inicio: ex?.inicio ?? p.leitura.inicios[nome] ?? null, offsetDias: ex?.offsetDias ?? OFFSET_NOVA_TRILHA, celulasComData: 0 }
  })
  const trilhaInfo = new Map(trilhas.map((t) => [t.nome, t]))

  const linhas: LinhaPlano[] = []
  const celulas: CelulaPlano[] = []
  const usadas = new Set<string>()
  let vazias = 0, novas = 0, alteradas = 0, iguais = 0, removidas = 0, manuais = 0, comData = 0

  for (const l of p.leitura.linhas) {
    let aula: AulaExistente | undefined, casou: LinhaPlano['casou'] = 'nenhum'
    const porNum = l.ordem != null ? porOrdem.get(l.ordem) : undefined
    if (porNum && !usadas.has(porNum.id) && (normalizar(porNum.disciplina) === normalizar(l.disciplina) || similaridade(porNum.disciplina, l.disciplina) >= 0.6)) { aula = porNum; casou = 'ordem' }
    if (!aula) {
      const k = porChave.get(`${normalizar(l.disciplina)}|${normalizar(l.titulo)}`)
      if (k && !usadas.has(k.id)) { aula = k; casou = 'titulo' }
    }
    if (aula) usadas.add(aula.id)
    linhas.push({ linha: l, aulaId: aula?.id ?? null, aulaOrdem: aula?.ordem ?? null, aulaTitulo: aula?.titulo ?? null, casou })
    if (!aula) continue

    for (const nome of p.leitura.trilhas) {
      const ex = trilhaInfo.get(nome)!
      const bruto = l.datas[nome] ?? null
      const novaData = bruto ? somaDiasISO(bruto, desc) : null
      const atual = ex.existenteId ? celulaPor.get(`${ex.existenteId}|${aula.id}`) : undefined
      if (!novaData) {
        vazias++
        if (atual?.dataCronograma) { celulas.push({ trilhaNome: nome, aulaId: aula.id, ordem: aula.ordem, dataCronograma: null, situacao: 'removida' }); removidas++ }
        continue
      }
      comData++; ex.celulasComData++
      if (atual?.dataManual) manuais++
      const situacao: CelulaPlano['situacao'] = !atual || !atual.dataCronograma ? 'nova' : atual.dataCronograma === novaData ? 'igual' : 'alterada'
      if (situacao === 'nova') novas++; else if (situacao === 'alterada') alteradas++; else iguais++
      celulas.push({ trilhaNome: nome, aulaId: aula.id, ordem: aula.ordem, dataCronograma: novaData, situacao })
    }
  }
  const casadas = linhas.filter((l) => l.aulaId).length
  return {
    linhas, trilhas, celulas, descontoDias: desc,
    resumo: { linhasLidas: linhas.length, linhasCasadas: casadas, linhasSemAula: linhas.length - casadas, celulasComData: comData, celulasVazias: vazias, novas, alteradas, iguais, removidas, manuaisPreservadas: manuais },
  }
}
