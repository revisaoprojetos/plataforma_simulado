// Cruza o CSV oficial do Simulado PGE/RS com o que está gravado no banco.
// Confere: nº de questões, nº de alternativas (multiplicação), gabarito e textos.
// Uso: node scripts/verificar-simulado-csv.mjs
import { readFileSync, readdirSync } from 'node:fs'

const SIM = 'e17cae0a-db46-4563-b2ad-dcc16c8ec367' // Simulado Pré Edital - PGE/RS

// ── env / supabase ──
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const rest = (p) => fetch(`${URL}/rest/v1/${p}`, { headers: H }).then((r) => r.json())

// ── acha e lê o CSV (corrige encoding duplo se preciso) ──
const dir = 'C:/Users/joooa/Downloads'
const csvName = readdirSync(dir).find((f) => /pge rs.*escolha\.csv$/i.test(f))
if (!csvName) { console.error('CSV não encontrado em', dir); process.exit(1) }
let raw = readFileSync(`${dir}/${csvName}`).toString('utf8')
if (raw.includes('NÃºmero') || raw.includes('MÃºltipla')) {
  raw = Buffer.from(raw, 'latin1').toString('utf8') // desfaz UTF-8 lido como Latin-1
}

// ── parser CSV (RFC4180: aspas + vírgulas/quebras dentro do campo) ──
function parseCSV(text) {
  const rows = []; let row = [], field = '', inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++ } else inQ = false }
      else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else if (c !== '\r') field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows
}

const norm = (s) => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
const LETRAS = ['A', 'B', 'C', 'D', 'E']

const rows = parseCSV(raw).filter((r) => r.length > 8 && /^\d+$/.test((r[0] || '').trim()))
// Colunas: 0=Número 1=Tipo 2=Enunciado 3-7=Alt A-E 8=Correta
const csv = rows.map((r) => ({
  n: Number(r[0].trim()),
  enun: r[2] || '',
  alts: [r[3], r[4], r[5], r[6], r[7]].map((x) => (x || '').trim()),
  correta: (r[8] || '').trim().toUpperCase(),
})).sort((a, b) => a.n - b.n)

// ── banco: questões do simulado, na ordem, com alternativas ──
const pq = await rest(`simulado_prova_questoes?simulado_id=eq.${SIM}&select=questao_id,ordem&order=ordem`)
const ids = pq.map((x) => x.questao_id)
const ques = await rest(`simulado_questoes?id=in.(${ids.join(',')})&select=id,enunciado`)
const enunDe = new Map(ques.map((q) => [q.id, q.enunciado || '']))
const alts = await rest(`simulado_alternativas?questao_id=in.(${ids.join(',')})&select=questao_id,texto,ordem,correta&order=ordem`)
const altsDe = new Map()
for (const a of alts) { const arr = altsDe.get(a.questao_id) ?? []; arr.push(a); altsDe.set(a.questao_id, arr) }

console.log(`CSV: ${csv.length} questões · Banco: ${pq.length} questões (simulado PGE/RS)\n`)

const probMult = [], probGab = [], probAlt = [], probAlin = [], probEnun = []

for (let i = 0; i < pq.length; i++) {
  const qid = pq[i].questao_id
  const c = csv[i] // alinhamento por posição (prova ordem i ↔ CSV nº i+1)
  const num = c ? c.n : i + 1
  const A = (altsDe.get(qid) ?? []).slice().sort((x, y) => x.ordem - y.ordem)
  const enunDB = enunDe.get(qid) || ''

  // alinhamento (o enunciado do banco bate com o do CSV nessa posição?)
  if (c && norm(enunDB).slice(0, 40) !== norm(c.enun).slice(0, 40)) probAlin.push(num)

  // multiplicação / contagem
  if (A.length !== 5) probMult.push(`Q${num}: ${A.length} alternativas`)

  // gabarito
  const corretas = A.filter((a) => a.correta)
  const letraDB = corretas.length === 1 ? LETRAS[A.indexOf(corretas[0])] : `(${corretas.length} corretas)`
  if (c && letraDB !== c.correta) probGab.push(`Q${num}: banco=${letraDB} · csv=${c.correta}`)

  // textos das alternativas (comparando as 5 por posição)
  if (c && A.length === 5) {
    const difs = []
    for (let k = 0; k < 5; k++) if (norm(A[k].texto) !== norm(c.alts[k])) difs.push(LETRAS[k])
    if (difs.length) probAlt.push(`Q${num}: difere em ${difs.join(',')}`)
  }
}

const bloco = (titulo, arr) => {
  console.log(`\n■ ${titulo}: ${arr.length ? arr.length + ' problema(s)' : 'OK ✓'}`)
  arr.slice(0, 40).forEach((x) => console.log('   -', x))
  if (arr.length > 40) console.log(`   … +${arr.length - 40}`)
}
bloco('Alternativas multiplicadas / contagem ≠ 5', probMult)
bloco('Gabarito divergente (banco × CSV)', probGab)
bloco('Texto de alternativa divergente', probAlt)
bloco('Alinhamento de enunciado (posição prova × CSV)', probAlin.map((n) => `Q${n}`))
