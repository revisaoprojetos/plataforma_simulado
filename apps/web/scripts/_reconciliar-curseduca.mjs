// SOMENTE LEITURA — Reconciliação Curseduca × plataforma (comprovação P0.1 "diferença = 0").
// Para cada grupo configurado na sync (simulado_curseduca_sync.grupos ativos), lista os membros na
// Curseduca e confere quem NÃO existe como aluno ativo na plataforma (por e-mail principal OU secundário).
// Gera: total Curseduca × total plataforma × FALTANTES (sem conta) + DELETADOS (conta marcada deletada =
// "se perdeu") + resumo por grupo. Não cria/remove nada.
// Uso:
//   node scripts/_reconciliar-curseduca.mjs                 → todos os grupos ativos
//   node scripts/_reconciliar-curseduca.mjs --grupos=12,34  → só esses grupos (teste rápido)
import { readFileSync, writeFileSync } from 'node:fs'
import pg from 'pg'

const env = {}
for (const line of readFileSync('.env.local', 'utf8').split('\n')) { const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '') }
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 3, ssl: { rejectUnauthorized: false } })
const TID = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const BASE = env.CURSEDUCA_BASE_URL || 'https://prof.curseduca.pro'
const API_KEY = env.CURSEDUCA_API_KEY, USER = env.CURSEDUCA_USER, PASS = env.CURSEDUCA_PASS
const GRUPOS_ARG = (process.argv.find((a) => a.startsWith('--grupos=')) || '').split('=')[1]
const csv = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// ── Cliente Curseduca (mesma lógica do lib/curseduca/client.ts) ──
let TOKEN = null
async function login() {
  const resp = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { accept: 'application/json', 'content-type': 'application/json', api_key: API_KEY },
    body: JSON.stringify({ username: USER, password: PASS, device: { app: { uuid: 'revisao' }, device: 'server', registrationToken: 'server' } }),
  })
  if (!resp.ok) throw new Error(`login falhou (${resp.status})`)
  const j = await resp.json()
  if (!j.accessToken) throw new Error('login sem accessToken')
  TOKEN = j.accessToken
}
async function api(path) {
  for (let t = 0; t < 5; t++) {
    if (!TOKEN) await login()
    let r
    try { r = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json', api_key: API_KEY, Authorization: `Bearer ${TOKEN}` } }) }
    catch (e) { if (t < 4) { await dormir(500 * 2 ** t); continue } throw e }
    if (r.status === 401) { TOKEN = null; continue }               // token expirou → relogin
    if (r.ok) return r.json()
    if ([429, 500, 502, 503, 504].includes(r.status)) { await dormir(Math.min(8000, 500 * 2 ** t) + Math.floor(Math.random() * 250)); continue }
    throw new Error(`${path} (${r.status})`)
  }
  throw new Error(`${path} (esgotou tentativas)`)
}
async function listarMembros(gid) {
  const limit = 200; let offset = 0; const out = []
  for (let p = 0; p < 100; p++) {
    const j = await api(`/members?groupId=${gid}&limit=${limit}&offset=${offset}`)
    const data = j.data ?? []
    for (const m of data) out.push({ id: m.id, nome: (m.name ?? '').trim(), email: (m.email ?? '').trim().toLowerCase() || null })
    if (!j.metadata?.hasMore || data.length === 0) break
    offset += limit
  }
  return out
}

// ── Grupos configurados na sync ──
let gids
if (GRUPOS_ARG) {
  gids = GRUPOS_ARG.split(',').map((n) => Number(n.trim())).filter(Number.isFinite)
} else {
  const { rows } = await pool.query(`SELECT grupos FROM simulado_curseduca_sync WHERE tenant_id=$1 AND ativo=true`, [TID])
  gids = [...new Set(rows.flatMap((r) => (Array.isArray(r.grupos) ? r.grupos : [])).map(Number).filter(Number.isFinite))]
}
if (!gids.length) { console.log('Nenhum grupo configurado na sync.'); await pool.end(); process.exit(0) }
console.log(`Grupos a conferir: ${gids.length}\n`)

// ── Lado Curseduca (dedup por e-mail; guarda grupos + nome) ──
const porEmail = new Map()      // email -> { nome, grupos:Set }
const porGrupo = []             // { gid, curseduca, erro? }
let i = 0
for (const gid of gids) {
  i++
  try {
    const membros = await listarMembros(gid)
    let n = 0
    for (const m of membros) {
      if (!m.email) continue
      n++
      const it = porEmail.get(m.email) ?? { nome: m.nome, grupos: new Set() }
      it.grupos.add(gid); if (!it.nome && m.nome) it.nome = m.nome
      porEmail.set(m.email, it)
    }
    porGrupo.push({ gid, curseduca: n })
  } catch (e) {
    porGrupo.push({ gid, curseduca: 0, erro: String(e?.message ?? e).slice(0, 160) })
  }
  if (i % 20 === 0 || i === gids.length) console.log(`  ${i}/${gids.length} grupos · ${porEmail.size} e-mails únicos até aqui`)
  await dormir(120) // gentil com a API
}
const emails = [...porEmail.keys()]
console.log(`\nCurseduca: ${emails.length} e-mails únicos (todos os grupos).`)

// ── Lado plataforma: ATIVOS (principal OU secundário, deletado=false) e DELETADOS ──
const ativos = new Set(), deletados = new Set()
const marca = (em, del) => { const e = String(em).toLowerCase(); if (!del) ativos.add(e); else if (!ativos.has(e)) deletados.add(e) }
// principal
{ const { rows } = await pool.query(`SELECT lower(email) AS e, deletado FROM simulado_estudantes WHERE tenant_id=$1 AND lower(email)=ANY($2)`, [TID, emails]); for (const r of rows) marca(r.e, r.deletado) }
// secundário (unnest + lower para casar mesmo com caixa diferente)
{ const { rows } = await pool.query(`SELECT lower(s) AS e, e2.deletado FROM simulado_estudantes e2, unnest(e2.emails_secundarios) s WHERE e2.tenant_id=$1 AND lower(s)=ANY($2)`, [TID, emails]); for (const r of rows) marca(r.e, r.deletado) }
// quem ficou só em deletados (nunca apareceu como ativo) permanece; tira da lista de deletados quem também tem ativo
for (const e of ativos) deletados.delete(e)

const faltantes = emails.filter((e) => !ativos.has(e) && !deletados.has(e))
const perdidos = [...deletados]

// ── Saída ──
const stamp = new Date().toISOString().slice(0, 10)
const linhasFalt = [['email', 'nome', 'grupos_curseduca'], ...faltantes.map((e) => { const it = porEmail.get(e); return [e, it?.nome ?? '', [...(it?.grupos ?? [])].join(' ')] })]
const linhasPerd = [['email', 'nome', 'grupos_curseduca'], ...perdidos.map((e) => { const it = porEmail.get(e); return [e, it?.nome ?? '', [...(it?.grupos ?? [])].join(' ')] })]
const linhasGrp = [['grupo_id', 'membros_curseduca', 'erro'], ...porGrupo.map((g) => [g.gid, g.curseduca, g.erro ?? ''])]
const fFalt = `scripts/_reconciliar-curseduca-faltantes-${stamp}.csv`
const fPerd = `scripts/_reconciliar-curseduca-perdidos-${stamp}.csv`
const fGrp = `scripts/_reconciliar-curseduca-porgrupo-${stamp}.csv`
writeFileSync(fFalt, linhasFalt.map((r) => r.map(csv).join(',')).join('\n'), 'utf8')
writeFileSync(fPerd, linhasPerd.map((r) => r.map(csv).join(',')).join('\n'), 'utf8')
writeFileSync(fGrp, linhasGrp.map((r) => r.map(csv).join(',')).join('\n'), 'utf8')

const gruposFalhos = porGrupo.filter((g) => g.erro)
console.log('\n================ RECONCILIAÇÃO Curseduca × plataforma ================')
console.log(`Total na Curseduca (e-mails únicos):     ${emails.length}`)
console.log(`Existem ATIVOS na plataforma:            ${ativos.size}`)
console.log(`FALTANTES (na Curseduca, sem conta):     ${faltantes.length}   -> ${fFalt}`)
console.log(`PERDIDOS (conta deletada na plataforma): ${perdidos.length}   -> ${fPerd}`)
console.log(`Grupos com ERRO ao ler (API):            ${gruposFalhos.length}${gruposFalhos.length ? '  (ver ' + fGrp + ')' : ''}`)
console.log(`Diferença (faltantes+perdidos):          ${faltantes.length + perdidos.length}   ${faltantes.length + perdidos.length === 0 ? '✅ ZERO' : '⚠️'}`)
console.log('======================================================================')
await pool.end()
