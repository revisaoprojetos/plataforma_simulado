// Exportação genérica de tabelas para CSV e Excel (.xlsx), reutilizável em qualquer
// lista do admin. As colunas descrevem título + como extrair o valor de cada linha.
// O Excel carrega o exceljs sob demanda (via excel-kit) para não pesar o bundle.

export type ColunaExport<T> = {
  titulo: string
  valor: (row: T) => string | number | null | undefined
  largura?: number
}

function celulaCsv(v: unknown): string {
  if (v == null) return ''
  const s = String(v)
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function disparar(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** CSV com BOM UTF-8 e separador `;` (abre certo no Excel pt-BR). */
export function baixarCsv<T>(rows: T[], colunas: ColunaExport<T>[], nomeArquivo: string) {
  const sep = ';'
  const linhas = [
    colunas.map((c) => celulaCsv(c.titulo)).join(sep),
    ...rows.map((r) => colunas.map((c) => celulaCsv(c.valor(r))).join(sep)),
  ]
  const csv = '﻿' + linhas.join('\r\n')
  const nome = nomeArquivo.endsWith('.csv') ? nomeArquivo : `${nomeArquivo}.csv`
  disparar(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), nome)
}

/** Excel .xlsx estilizado (cabeçalho roxo, congelado, com autofiltro). */
export async function baixarExcel<T>(
  rows: T[],
  colunas: ColunaExport<T>[],
  nomeArquivo: string,
  opts?: { titulo?: string; subtitulo?: string },
) {
  const { novoWorkbook, cabecalho, titulo: tituloFn, estilizarLinhas, baixarWorkbook } = await import('@/lib/relatorios/excel-kit')
  const wb = await novoWorkbook()
  const ws = wb.addWorksheet('Dados')
  const ncols = colunas.length

  if (opts?.titulo) tituloFn(ws, opts.titulo, opts.subtitulo ?? '', ncols)
  const linhaCab = ws.rowCount + 1
  cabecalho(ws, colunas.map((c) => c.titulo))
  for (const r of rows) ws.addRow(colunas.map((c) => { const v = c.valor(r); return v == null ? '' : v }))

  // Designer: zebra + bordas finas nas linhas de dados.
  estilizarLinhas(ws, linhaCab + 1, ws.rowCount, ncols)

  colunas.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.largura ?? Math.min(48, Math.max(12, c.titulo.length + 6))
  })
  ws.views = [{ state: 'frozen', ySplit: linhaCab }]
  if (rows.length) ws.autoFilter = { from: { row: linhaCab, column: 1 }, to: { row: linhaCab, column: ncols } }

  await baixarWorkbook(wb, nomeArquivo)
}

/** Sufixo de data (AAAA-MM-DD) para nomes de arquivo. */
export function sufixoData(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
