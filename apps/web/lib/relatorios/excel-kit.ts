// Kit para exportações Excel ricas (estilo "verticalizado"): abas estilizadas,
// cabeçalho colorido, cores por desempenho, dropdowns e download. Client-safe —
// carrega o exceljs sob demanda (dynamic import) para não pesar o bundle.
import type { Workbook, Worksheet } from 'exceljs'

export const CORES = {
  roxo: 'FF5B21B6',
  claro: 'FFEEE9F9',
  verdeClaro: 'FFD1FAE5',
  amareloClaro: 'FFFEF3C7',
  vermelhoClaro: 'FFFEE2E2',
  cinzaClaro: 'FFF3F4F6',
  branco: 'FFFFFFFF',
  cinzaTexto: 'FF777777',
}

/** Cria um Workbook novo (carrega o exceljs sob demanda). */
export async function novoWorkbook(): Promise<Workbook> {
  const ExcelJS = (await import('exceljs')).default
  return new ExcelJS.Workbook()
}

/** Cor de fundo por faixa de desempenho (%). */
export function corPct(pct: number | null | undefined): string {
  if (pct == null) return CORES.cinzaClaro
  if (pct >= 70) return CORES.verdeClaro
  if (pct >= 40) return CORES.amareloClaro
  return CORES.vermelhoClaro
}

/** Linha de cabeçalho de tabela (roxo, branco, centralizado). */
export function cabecalho(ws: Worksheet, cols: (string | number)[], argb = CORES.roxo) {
  const row = ws.addRow(cols)
  row.font = { bold: true, color: { argb: CORES.branco } }
  row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
  row.height = 22
  row.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } } })
  return row
}

/** Aplica zebra (linhas alternadas) + bordas finas num intervalo de linhas de dados. */
export function estilizarLinhas(ws: Worksheet, primeira: number, ultima: number, ncols: number) {
  const borda = { style: 'thin' as const, color: { argb: 'FFE5E7EB' } }
  for (let r = primeira; r <= ultima; r++) {
    const row = ws.getRow(r)
    const zebra = (r - primeira) % 2 === 1
    for (let c = 1; c <= ncols; c++) {
      const cell = row.getCell(c)
      if (zebra) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: CORES.cinzaClaro } }
      cell.border = { bottom: borda, right: borda }
    }
  }
}

/** Faixa de seção (barra roxa mesclada). */
export function secao(ws: Worksheet, txt: string, ncols: number, argb = CORES.roxo) {
  const row = ws.addRow([txt]); row.height = 20
  for (let c = 1; c <= ncols; c++) row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } }
  row.getCell(1).font = { bold: true, size: 12, color: { argb: CORES.branco } }
  row.getCell(1).alignment = { vertical: 'middle' }
  ws.mergeCells(row.number, 1, row.number, ncols)
  return row
}

/** Título grande + subtítulo em itálico no topo de uma aba. */
export function titulo(ws: Worksheet, txt: string, sub: string, ncols: number) {
  const t = ws.addRow([txt]); t.getCell(1).font = { bold: true, size: 16 }; ws.mergeCells(t.number, 1, t.number, ncols)
  const s = ws.addRow([sub]); s.getCell(1).font = { italic: true, color: { argb: CORES.cinzaTexto } }; ws.mergeCells(s.number, 1, s.number, ncols)
  ws.addRow([])
}

/** Dropdown (lista) de opções numa coluna, das linhas 2..n. */
export function dropdown(ws: Worksheet, coluna: number, ultimaLinha: number, opcoes: string[]) {
  for (let r = 2; r <= ultimaLinha; r++) {
    ws.getCell(r, coluna).dataValidation = { type: 'list', allowBlank: true, formulae: [`"${opcoes.join(',')}"`] }
  }
}

/** Gera o arquivo e dispara o download no navegador. */
export async function baixarWorkbook(wb: Workbook, nomeArq: string) {
  const buf = await wb.xlsx.writeBuffer()
  const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArq.endsWith('.xlsx') ? nomeArq : `${nomeArq}.xlsx`
  document.body.appendChild(a); a.click(); a.remove()
  URL.revokeObjectURL(url)
}

/** Sanitiza um texto para nome de arquivo. */
export function nomeArquivo(base: string, sufixo = '') {
  const limpo = (base.trim() || 'relatorio').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, '_')
  return sufixo ? `${limpo}_${sufixo}` : limpo
}
