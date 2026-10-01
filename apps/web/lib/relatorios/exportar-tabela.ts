// Exportação de uma tabela simples (cabeçalho + linhas) em CSV, Excel, Word e PDF — tudo client-side.
// Reutilizável por qualquer tela. Chamar sempre do navegador (usa document/window/Blob).
type Celula = string | number | null | undefined

function baixarBlob(blob: Blob, nome: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nome
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

/** CSV (separador ';' + BOM para Excel abrir com acentos). */
export function baixarTabelaCsv(nomeBase: string, head: string[], rows: Celula[][]) {
  const esc = (v: Celula) => { const s = String(v ?? ''); return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  const csv = [head, ...rows].map((l) => l.map(esc).join(';')).join('\n')
  baixarBlob(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' }), `${nomeBase}.csv`)
}

/** Excel (.xlsx) via exceljs — reusa o helper existente (cabeçalho roxo + zebra). */
export async function baixarTabelaExcel(nomeBase: string, head: string[], rows: Celula[][]) {
  const { baixarExcelSimples } = await import('@/lib/relatorios/excel-kit')
  await baixarExcelSimples(nomeBase, [head, ...rows] as (string | number | null)[][])
}

/** Word (.docx) via docx — tabela 100% largura, cabeçalho roxo e zebra. */
export async function baixarTabelaWord(nomeBase: string, titulo: string, head: string[], rows: Celula[][]) {
  const { Document, Packer, Table, TableRow, TableCell, Paragraph, TextRun, WidthType } = await import('docx')
  const celula = (s: Celula, opts: { bold?: boolean; color?: string } = {}, fill?: string) =>
    new TableCell({
      shading: fill ? { fill } : undefined,
      margins: { top: 40, bottom: 40, left: 90, right: 90 },
      children: [new Paragraph({ children: [new TextRun({ text: String(s ?? ''), size: 18, bold: opts.bold, color: opts.color })] })],
    })
  const headRow = new TableRow({ tableHeader: true, children: head.map((h) => celula(h, { bold: true, color: 'FFFFFF' }, '6D28D9')) })
  const dataRows = rows.map((r, i) => new TableRow({ children: r.map((c) => celula(c, {}, i % 2 ? 'F5F3FF' : undefined)) }))
  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headRow, ...dataRows] })
  const doc = new Document({ sections: [{ children: [new Paragraph({ children: [new TextRun({ text: titulo, bold: true, size: 28 })] }), new Paragraph({ text: '' }), table] }] })
  baixarBlob(await Packer.toBlob(doc), `${nomeBase}.docx`)
}

/** PDF via janela de impressão (sem lib): abre o HTML estilizado e dispara o "Salvar como PDF". */
export function baixarTabelaPdf(titulo: string, head: string[], rows: Celula[][]) {
  const w = window.open('', '_blank')
  if (!w) return
  const esc = (s: Celula) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
  const thead = `<tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`
  const tbody = rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
  w.document.write(`<!doctype html><html lang="pt-br"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    *{box-sizing:border-box} body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:24px;color:#111}
    h1{font-size:18px;margin:0 0 14px}
    table{border-collapse:collapse;width:100%;font-size:11px}
    th,td{border:1px solid #e5e7eb;padding:6px 8px;text-align:left;white-space:nowrap}
    th{background:#6D28D9;color:#fff}
    tr:nth-child(even) td{background:#f5f3ff}
    @media print{@page{size:landscape;margin:12mm}}
  </style></head><body><h1>${esc(titulo)}</h1><table><thead>${thead}</thead><tbody>${tbody}</tbody></table>
  <script>window.onload=function(){setTimeout(function(){window.print()},200)}</script></body></html>`)
  w.document.close()
}
