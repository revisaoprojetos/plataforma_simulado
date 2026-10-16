// Relatório MEQ: acertos por aluno nos 2 simulados, separando Q1–20 e Q21–60 (medições diferentes).
// Saída: relatorio-meq-simulados.md na raiz do projeto.
import { readFileSync, writeFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'
const env = {}
for (const l of readFileSync('.env.local', 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^"|"$/g, '') }
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const SIMS = [
  { id: 'a1ce89ae-bef3-4d01-ac92-bac527707294', nome: null },
  { id: '364921d6-3c13-4158-8f78-776485f364b1', nome: null },
]

// Acha um título "amigável" em várias tabelas possíveis.
async function tituloDe(id) {
  for (const [t, col] of [['simulados', 'titulo'], ['simulado_pastas', 'nome'], ['simulado_cadernos_designer', 'nome'], ['simulado_cadernos_teste', 'nome']]) {
    try { const { data } = await sb.from(t).select(`${col}`).eq('id', id).maybeSingle(); if (data && data[col]) return data[col] } catch { /* tabela/coluna ausente */ }
  }
  return id.slice(0, 8)
}

// fetch paginado por IN (chunks). IMPORTANTE: query NOVA por página + .order('id') por coluna ÚNICA,
// senão a paginação sem ordem estável DUPLICA/perde linhas (landmine conhecida) — foi o que inflou os números.
async function fetchByIn(tabela, cols, campo, ids, extra) {
  const out = []
  const sel = cols.includes('id') ? cols : `id, ${cols}`
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    let from = 0
    while (true) {
      let q = sb.from(tabela).select(sel).in(campo, chunk).order('id', { ascending: true })
      if (extra) q = extra(q)
      const { data, error } = await q.range(from, from + 999)
      if (error) throw error
      out.push(...(data || []))
      if (!data || data.length < 1000) break
      from += 1000
    }
  }
  return out
}

const dados = {} // estudante_id -> { nome, sims: { simId: {a: n1-20, b: n21-60} } }
const nomes = new Map()

for (const sim of SIMS) {
  // ordem por questao_id
  const pq = await fetchByIn('simulado_prova_questoes', 'questao_id, ordem', 'simulado_id', [sim.id])
  const ordemDe = new Map(pq.map((x) => [x.questao_id, Number(x.ordem)]))
  // IDENTIFICAÇÃO (os 2 simulados são do mesmo dia): disciplinas por faixa distinguem o conteúdo.
  const qids = pq.map((x) => x.questao_id)
  const qs = await fetchByIn('simulado_questoes', 'id, disciplina_id', 'id', qids)
  const discIds = [...new Set(qs.map((q) => q.disciplina_id).filter(Boolean))]
  const discs = discIds.length ? await fetchByIn('simulado_disciplinas', 'id, nome', 'id', discIds) : []
  const dnome = new Map(discs.map((d) => [d.id, d.nome]))
  const discDe = new Map(qs.map((q) => [q.id, dnome.get(q.disciplina_id) || '(sem disciplina)']))
  const cf = { a: {}, b: {} }
  for (const p of pq) { const f = Number(p.ordem) < 20 ? 'a' : 'b'; const dn = discDe.get(p.questao_id) || '(sem)'; cf[f][dn] = (cf[f][dn] || 0) + 1 }
  const topDisc = (o) => Object.entries(o).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k} (${v})`).join(', ')
  sim.discA = topDisc(cf.a); sim.discB = topDisc(cf.b)
  // sessões finalizadas, não-teste, não-deletadas
  const sess = await fetchByIn('simulado_sessoes_prova', 'id, estudante_id, nota, iniciado_em', 'simulado_id', [sim.id],
    (q) => q.eq('is_teste', false).eq('status', 'finalizada').eq('deletado', false))
  // período/turno (data+hora das sessões) p/ identificar o simulado, já que o registro em `simulados` foi removido.
  const datas = sess.map((s) => s.iniciado_em).filter(Boolean).sort()
  const fmtD = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '?'
  const fmtH = (iso) => new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  sim.ini = datas[0] || null
  sim.periodo = datas.length ? fmtD(datas[0]) : '?'
  sim.janela = datas.length ? `${fmtH(datas[0])}–${fmtH(datas[datas.length - 1])}` : '?'
  const h0 = datas.length ? new Date(datas[0]).toLocaleString('en-US', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }) : '0'
  sim.turno = Number(h0) < 12 ? 'Manhã' : Number(h0) < 18 ? 'Tarde' : 'Noite'
  const sessIds = sess.map((s) => s.id)
  const donoSess = new Map(sess.map((s) => [s.id, s.estudante_id]))
  // respostas corretas por sessão
  const resp = await fetchByIn('simulado_respostas_objetivas', 'sessao_id, questao_id, correta', 'sessao_id', sessIds)
  // agrega por sessão: acertos em 1-20 (ordem<20) e 21-60 (ordem>=20)
  const porSess = new Map() // sessao_id -> {a,b}
  for (const r of resp) {
    if (!r.correta) continue
    const ord = ordemDe.get(r.questao_id); if (ord == null) continue
    const o = porSess.get(r.sessao_id) || { a: 0, b: 0 }
    if (ord < 20) o.a++; else o.b++
    porSess.set(r.sessao_id, o)
  }
  // por aluno: MELHOR sessão (maior total de acertos) deste simulado
  const melhorPorAluno = new Map()
  for (const s of sess) {
    const o = porSess.get(s.id) || { a: 0, b: 0 }
    const tot = o.a + o.b
    const atual = melhorPorAluno.get(s.estudante_id)
    if (!atual || tot > atual.tot) melhorPorAluno.set(s.estudante_id, { a: o.a, b: o.b, tot })
  }
  for (const [eid, o] of melhorPorAluno) {
    dados[eid] = dados[eid] || { sims: {} }
    dados[eid].sims[sim.id] = o
  }
}

// nomes dos alunos
const ids = Object.keys(dados)
const ests = await fetchByIn('simulado_estudantes', 'id, nome, email', 'id', ids)
for (const e of ests) nomes.set(e.id, e.nome || e.email || e.id.slice(0, 8))

// monta linhas
const linhas = ids.map((eid) => {
  const r = { nome: nomes.get(eid) || eid.slice(0, 8), sims: dados[eid].sims }
  let a = 0, b = 0
  for (const sim of SIMS) { const o = r.sims[sim.id]; if (o) { a += o.a; b += o.b } }
  r.a = a; r.b = b; r.tot = a + b
  return r
}).sort((x, y) => y.tot - x.tot || x.nome.localeCompare(y.nome, 'pt-BR'))

// ordena os simulados por horário (manhã = Simulado 1) p/ rótulos consistentes
SIMS.sort((a, b) => (a.ini || '').localeCompare(b.ini || ''))

// markdown
const esc = (s) => String(s).replace(/\|/g, '\\|')
let md = `# Relatório MEQ — Acertos nos 2 simulados\n\n`
md += `_Tenant: **MEQ Concursos** · gerado a partir das sessões finalizadas (não-teste). Para cada aluno/simulado foi usada a MELHOR tentativa. Questões **1–20** e **21–60** contadas separadamente (medições de nota diferentes)._\n\n`
md += `> ⚠️ O registro destes 2 simulados foi removido da tabela \`simulados\` (sem título). Ambos em **${SIMS[0]?.periodo}** — identifico cada um pelo **turno**, **janela de horário** e **disciplinas das questões**.\n\n`
md += `**Simulados (identificação):**\n\n`
SIMS.forEach((s, i) => {
  const n = linhas.filter((l) => l.sims[s.id]).length
  md += `### Simulado ${i + 1} — ${s.turno} · ${s.periodo} · ${s.janela}\n`
  md += `- **${n} alunos** · 60 questões · _id \`${s.id.slice(0, 8)}\`_\n`
  md += `- **Q1–20** (base): ${esc(s.discA)}\n`
  md += `- **Q21–60** (específicas): ${esc(s.discB)}\n\n`
})
md += `\nTotal de alunos (fizeram ≥1 simulado): **${linhas.length}**\n\n`

// Tabela principal: total dos 2 simulados
md += `## Total dos 2 simulados (por aluno)\n\n`
md += `Colunas: acertos em **Q1–20**, **Q21–60** e **Total** (soma dos 2 simulados).\n\n`
md += `| # | Aluno | Q1–20 | Q21–60 | Total |\n|---:|---|---:|---:|---:|\n`
linhas.forEach((l, i) => { md += `| ${i + 1} | ${esc(l.nome)} | ${l.a} | ${l.b} | **${l.tot}** |\n` })

// Detalhe por simulado
SIMS.forEach((s, si) => {
  const arr = linhas.filter((l) => l.sims[s.id]).map((l) => ({ nome: l.nome, ...l.sims[s.id] })).sort((x, y) => y.tot - x.tot || x.nome.localeCompare(y.nome, 'pt-BR'))
  md += `\n## Simulado ${si + 1} — ${s.turno} (${s.periodo} · ${s.janela})\n\n`
  md += `_Q21–60: ${esc(s.discB)}_\n\n`
  md += `| # | Aluno | Q1–20 | Q21–60 | Total |\n|---:|---|---:|---:|---:|\n`
  arr.forEach((l, i) => { md += `| ${i + 1} | ${esc(l.nome)} | ${l.a} | ${l.b} | **${l.tot}** |\n` })
})

writeFileSync('../../relatorio-meq-simulados.md', md, 'utf8')

// ===== EXCEL (.xlsx) =====
const wb = new ExcelJS.Workbook()
wb.creator = 'Relatório MEQ'
const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDEBFF' } }
function addSheet(aba, titulo, sub, rows) {
  const ws = wb.addWorksheet(aba.slice(0, 31))
  ws.mergeCells('A1:E1'); ws.getCell('A1').value = titulo; ws.getCell('A1').font = { bold: true, size: 13 }
  ws.mergeCells('A2:E2'); ws.getCell('A2').value = sub; ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } }; ws.getRow(2).height = 28; ws.getCell('A2').alignment = { wrapText: true, vertical: 'top' }
  const hr = ws.getRow(4); hr.values = ['#', 'Aluno', 'Q1–20', 'Q21–60', 'Total']; hr.font = { bold: true }
  hr.eachCell((c) => { c.fill = HEADER_FILL; c.border = { bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } } }; c.alignment = { horizontal: 'center' } })
  hr.getCell(2).alignment = { horizontal: 'left' }
  rows.forEach((r, i) => {
    const row = ws.addRow([i + 1, r.nome, r.a, r.b, r.tot])
    row.getCell(1).alignment = { horizontal: 'center' }; row.getCell(5).font = { bold: true }
    for (const c of [3, 4, 5]) row.getCell(c).alignment = { horizontal: 'center' }
  })
  ws.columns[0].width = 6; ws.columns[1].width = 42; ws.columns[2].width = 10; ws.columns[3].width = 10; ws.columns[4].width = 10
  ws.views = [{ state: 'frozen', ySplit: 4 }]
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 5 } }
}
// Aba 0: IDENTIFICAÇÃO dos simulados (qual é qual) — o registro em `simulados` foi apagado.
;(function addIdent() {
  const ws = wb.addWorksheet('Identificação')
  ws.mergeCells('A1:G1'); ws.getCell('A1').value = 'MEQ — Identificação dos 2 simulados (10/10/2026)'; ws.getCell('A1').font = { bold: true, size: 13 }
  ws.mergeCells('A2:G2'); ws.getCell('A2').value = 'O registro na tabela "simulados" foi removido (sem título). Cada simulado é identificado por TURNO/HORÁRIO e pelas DISCIPLINAS das questões.'; ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF666666' } }; ws.getRow(2).height = 26; ws.getCell('A2').alignment = { wrapText: true, vertical: 'top' }
  const hr = ws.getRow(4); hr.values = ['Simulado', 'Turno', 'Data', 'Horário', 'Alunos', 'Q1–20 (base)', 'Q21–60 (específicas = o que distingue)']; hr.font = { bold: true }
  hr.eachCell((c) => { c.fill = HEADER_FILL; c.alignment = { horizontal: 'center', wrapText: true, vertical: 'middle' }; c.border = { bottom: { style: 'thin', color: { argb: 'FFBBBBBB' } } } }); hr.height = 30
  SIMS.forEach((s, i) => {
    const n = linhas.filter((l) => l.sims[s.id]).length
    const r = ws.addRow([`Simulado ${i + 1}`, s.turno, s.periodo, s.janela, n, s.discA, s.discB])
    r.alignment = { vertical: 'top', wrapText: true }; r.getCell(1).font = { bold: true }; r.height = 56
  })
  ws.columns[0].width = 12; ws.columns[1].width = 8; ws.columns[2].width = 12; ws.columns[3].width = 14; ws.columns[4].width = 8; ws.columns[5].width = 40; ws.columns[6].width = 64
})()
// Aba 1: total dos 2 simulados
addSheet('Total (2 simulados)', 'MEQ — Total dos 2 simulados (por aluno)',
  `Acertos somando os 2 simulados de 10/10/2026. Q1–20 e Q21–60 separados. Melhor tentativa por aluno/simulado. ${linhas.length} alunos.`,
  linhas.map((l) => ({ nome: l.nome, a: l.a, b: l.b, tot: l.tot })))
// Abas por simulado
SIMS.forEach((s, si) => {
  const arr = linhas.filter((l) => l.sims[s.id]).map((l) => ({ nome: l.nome, ...l.sims[s.id] })).sort((x, y) => y.tot - x.tot || x.nome.localeCompare(y.nome, 'pt-BR'))
  addSheet(`Sim ${si + 1} - ${s.turno}`, `Simulado ${si + 1} — ${s.turno} (${s.periodo} · ${s.janela})`,
    `Q21–60: ${s.discB}`, arr)
})
await wb.xlsx.writeFile('../../relatorio-meq-simulados.xlsx')

console.log('OK — relatorio-meq-simulados.md + .xlsx gerados.')
console.log('Simulados:', SIMS.map((s) => `${s.nome} (${linhas.filter((l) => l.sims[s.id]).length} alunos)`).join(' | '))
console.log('Total alunos:', linhas.length)
console.log('Top 3:', linhas.slice(0, 3).map((l) => `${l.nome}: ${l.a}+${l.b}=${l.tot}`).join(' · '))
process.exit(0)
