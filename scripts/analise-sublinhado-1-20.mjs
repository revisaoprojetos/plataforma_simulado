// Cruza o xlsx-fonte (sublinhado real) com o banco, para as questões 1..20 (Português).
// Objetivo: descobrir, por questão, QUAIS termos deveriam estar sublinhados e o id no banco
// para permitir corrigir. Uso: node scripts/analise-sublinhado-1-20.mjs
import { readFileSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const ExcelJS = require('C:/Users/joooa/Downloads/Plataforma_Simulado/node_modules/.pnpm/exceljs@4.4.0/node_modules/exceljs/excel.js')

const SIM = 'e17cae0a-db46-4563-b2ad-dcc16c8ec367'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const rest = (p) => fetch(`${URL}/rest/v1/${p}`, { headers: H }).then((r) => r.json())
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }

// ── 1) xlsx: coletar sublinhados por linha (rows 2..21) ──
const dir = 'C:/Users/joooa/Downloads'
const cand = readdirSync(dir).filter((f) => /pge rs 2026 - preenchido.*\.xlsx$/i.test(f))
let wb = null
for (const c of cand) { try { const w = new ExcelJS.Workbook(); await w.xlsx.readFile(`${dir}/${c}`); wb = w; break } catch {} }
const ws = wb.getWorksheet('Múltipla Escolha') || wb.worksheets[0]
const subPorLinha = {}
for (let rn = 2; rn <= 21; rn++) {
  const row = ws.getRow(rn); const runs = []
  row.eachCell({ includeEmpty: false }, (cell, cn) => {
    const v = cell.value
    if (v && typeof v === 'object' && Array.isArray(v.richText)) {
      for (const r of v.richText) if (r.font && r.font.underline && r.text.trim()) runs.push({ col: cn, txt: r.text })
    } else if (typeof v === 'string' && cell.font && cell.font.underline && v.trim()) runs.push({ col: cn, txt: v })
  })
  if (runs.length) subPorLinha[rn] = runs
}

// ── 2) banco: questões 1..20 ──
const vinc = await rest(`simulado_prova_questoes?simulado_id=eq.${SIM}&select=questao_id,ordem&order=ordem`)
const emOrdem = vinc.slice(0, 20)
const qids = emOrdem.map((v) => v.questao_id)
let questoes = []
for (const g of chunk(qids, 80)) questoes = questoes.concat(await rest(`simulado_questoes?id=in.(${g.join(',')})&select=id,numero,enunciado`))
const byId = new Map(questoes.map((q) => [q.id, q]))

console.log('== SUBLINHADO NO XLSX (linhas 2..21 = questões 1..20) ==')
for (const rn of Object.keys(subPorLinha)) {
  console.log(`\nLinha ${rn} (questão ~${rn - 1}):`)
  for (const r of subPorLinha[rn]) console.log(`   col ${r.col}: "${r.txt}"`)
}

console.log('\n\n== TEXTO NO BANCO (questões que mencionam sublinhado + têm underline no xlsx) ==')
for (let i = 0; i < emOrdem.length; i++) {
  const q = byId.get(emOrdem[i].questao_id); if (!q) continue
  const menc = /sublinh/i.test(q.enunciado || '')
  const temXlsx = !!subPorLinha[i + 2]
  if (!menc && !temXlsx) continue
  console.log(`\n--- ordem ${emOrdem[i].ordem} | nº ${q.numero} | id ${q.id} | menciona:${menc} xlsxUnderline:${temXlsx}`)
  console.log('ENUN:', (q.enunciado || '').replace(/\n/g, ' \\n '))
}
