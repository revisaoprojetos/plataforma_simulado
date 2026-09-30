// SOMENTE LEITURA — Compara os grupos ATIVOS na sync (simulado_curseduca_sync.grupos) com TODOS os
// grupos da Curseduca e lista os que ficaram DE FORA, com o nº de membros de cada um (impacto: quantos
// alunos NÃO estão sendo importados). Ajuda a decidir se o escopo (hoje 35 grupos) está certo.
// Uso: node scripts/_curseduca-grupos-fora.mjs
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 2, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const BASE = env.CURSEDUCA_BASE_URL || 'https://prof.curseduca.pro'
const API_KEY = env.CURSEDUCA_API_KEY, USER = env.CURSEDUCA_USER, PASS = env.CURSEDUCA_PASS
const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
// Nomes que costumam ser excluídos de propósito (amostra/grátis/teste).
const ehExcluivel = (nome) => /amostra|gr[aá]tis|gratuit|teste|test|demo|sample|free/i.test(nome || '')

let TOKEN = null
async function login() {
  const resp = await fetch(`${BASE}/login`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', api_key: API_KEY }, body: JSON.stringify({ username: USER, password: PASS, device: { app: { uuid: 'revisao' }, device: 'server', registrationToken: 'server' } }) })
  if (!resp.ok) throw new Error(`login falhou (${resp.status})`)
  const j = await resp.json(); if (!j.accessToken) throw new Error('login sem accessToken'); TOKEN = j.accessToken
}
async function api(path) {
  for (let t = 0; t < 5; t++) {
    if (!TOKEN) await login()
    let r
    try { r = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json', api_key: API_KEY, Authorization: `Bearer ${TOKEN}` } }) }
    catch (e) { if (t < 4) { await dormir(500 * 2 ** t); continue } throw e }
    if (r.status === 401) { TOKEN = null; continue }
    if (r.ok) return r.json()
    if ([429, 500, 502, 503, 504].includes(r.status)) { await dormir(Math.min(8000, 500 * 2 ** t) + Math.floor(Math.random() * 250)); continue }
    throw new Error(`${path} (${r.status})`)
  }
  throw new Error(`${path} (esgotou)`)
}
async function todosGrupos() {
  const limit = 100; let offset = 0; const out = []
  for (let p = 0; p < 30; p++) {
    const j = await api(`/groups?limit=${limit}&offset=${offset}`)
    const data = j.data ?? []
    for (const g of data) out.push({ id: g.id, nome: g.name ?? '' })
    if (!j.metadata?.hasMore || data.length === 0) break
    offset += limit
  }
  return out
}
async function contarMembros(gid) {
  try { const j = await api(`/members?groupId=${gid}&limit=1&offset=0`); return Number(j.metadata?.totalCount) || 0 } catch { return -1 }
}

// Sync ativa
const { rows } = await pool.query(`SELECT grupos FROM simulado_curseduca_sync WHERE tenant_id=$1 AND ativo=true`, [TID])
const naSync = new Set(rows.flatMap((r) => (Array.isArray(r.grupos) ? r.grupos : [])).map(Number).filter(Number.isFinite))

// Todos os grupos da Curseduca
const grupos = await todosGrupos()
console.log(`Grupos na Curseduca: ${grupos.length} · na sync (ativos): ${naSync.size}`)
const fora = grupos.filter((g) => !naSync.has(Number(g.id)))
console.log(`FORA da sync: ${fora.length} — contando membros...\n`)

// Conta membros de cada grupo fora (1 chamada por grupo)
let i = 0
for (const g of fora) {
  g.membros = await contarMembros(g.id)
  g.excluivel = ehExcluivel(g.nome)
  i++
  if (i % 30 === 0 || i === fora.length) console.log(`  ${i}/${fora.length} grupos contados`)
  await dormir(120)
}
fora.sort((a, b) => (b.membros ?? 0) - (a.membros ?? 0))

// Saída
const stamp = new Date().toISOString().slice(0, 10)
const linhas = [['grupo_id', 'nome', 'membros', 'parece_excluivel'], ...fora.map((g) => [g.id, g.nome, g.membros, g.excluivel ? 'sim' : 'nao'])]
const fOut = `scripts/_curseduca-grupos-fora-${stamp}.csv`
writeFileSync(fOut, linhas.map((r) => r.map(csv).join(',')).join('\n'), 'utf8')

const reais = fora.filter((g) => !g.excluivel && g.membros > 0)
const somaReais = reais.reduce((s, g) => s + (g.membros > 0 ? g.membros : 0), 0)
console.log('\n================ GRUPOS FORA DA SYNC ================')
console.log(`Total fora da sync:                 ${fora.length}`)
console.log(`  - parecem amostra/grátis/teste:   ${fora.filter((g) => g.excluivel).length}`)
console.log(`  - parecem REAIS (com membros):    ${reais.length}  (~${somaReais} membros somados, com sobreposição)`)
console.log(`\nTop 15 grupos REAIS fora da sync (por nº de membros):`)
for (const g of reais.slice(0, 15)) console.log(`  [${g.id}] ${g.membros} membros — ${g.nome}`)
console.log(`\nCSV completo: ${fOut}`)
console.log('====================================================')
console.log('OBS: membros somados têm SOBREPOSIÇÃO (um aluno em vários grupos). É um teto, não o nº líquido.')
await pool.end()
