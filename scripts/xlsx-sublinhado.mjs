// Lê o xlsx-fonte do PGE/RS e extrai os trechos SUBLINHADOS (formatação de célula:
// rich text runs com font.underline). Mostra a verdade do que foi "configurado".
import { readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ExcelJS = require('C:/Users/joooa/Downloads/Plataforma_Simulado/node_modules/.pnpm/exceljs@4.4.0/node_modules/exceljs/excel.js')

const dir = 'C:/Users/joooa/Downloads'
const candidatos = readdirSync(dir).filter((f) => /pge rs 2026 - preenchido.*\.xlsx$/i.test(f))
console.log('Candidatos xlsx:', candidatos)

let wb = null, nome = null
for (const c of candidatos) {
  try {
    const w = new ExcelJS.Workbook()
    await w.xlsx.readFile(`${dir}/${c}`)
    wb = w; nome = c; break
  } catch (e) { console.log(`  (falhou ${c}: ${String(e.message).slice(0, 60)})`) }
}
if (!wb) { console.error('Nenhum xlsx pôde ser lido pelo exceljs.'); process.exit(1) }
console.log('Arquivo lido:', nome)
console.log('Abas:', wb.worksheets.map((w) => w.name).join(' | '))

const ws = wb.getWorksheet('Múltipla Escolha') || wb.worksheets[0]
console.log('Aba usada:', ws.name, '| linhas:', ws.rowCount, '| colunas:', ws.columnCount)

let comUnderline = 0, celulas = 0
const amostras = []

ws.eachRow((row, rn) => {
  row.eachCell({ includeEmpty: false }, (cell, cn) => {
    celulas++
    const v = cell.value
    let underlinedRuns = []
    let plain = ''
    if (v && typeof v === 'object' && Array.isArray(v.richText)) {
      plain = v.richText.map((r) => r.text).join('')
      underlinedRuns = v.richText.filter((r) => r.font && r.font.underline).map((r) => r.text)
    } else if (typeof v === 'string') {
      plain = v
      if (cell.font && cell.font.underline) underlinedRuns = [v] // célula inteira sublinhada
    }
    if (underlinedRuns.length) {
      comUnderline++
      if (amostras.length < 25) amostras.push({ cel: `${cell.address}(L${rn}C${cn})`, sub: underlinedRuns, plain: plain.slice(0, 180) })
    }
  })
})

console.log('\nCélulas no total:', celulas)
console.log('Células com SUBLINHADO (formatação):', comUnderline)
console.log('\n== AMOSTRAS (trecho sublinhado → contexto da célula) ==')
for (const a of amostras) {
  console.log(`\n[${a.cel}]`)
  console.log('  sublinhado:', JSON.stringify(a.sub))
  console.log('  contexto :', a.plain.replace(/\n/g, ' '))
}
