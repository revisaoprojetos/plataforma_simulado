// Backfill de transações/pagamentos ANTIGOS da Guru → plataforma.
//
// O quê: puxa /api/v2/transactions (último 1 ano, janelas de ≤180 dias, paginação por cursor) e:
//   (1) grava cada transação em simulado_integracao_eventos (mesmo formato dos webhooks, datas em ISO),
//       dedup por UNIQUE(provider, event_id) com event_id = "<id>:<status>" → o "Histórico de pagamentos"
//       de cada aluno passa a mostrar o histórico completo, sem tela nova;
//   (2) ENRIQUECE o cadastro de alunos QUE JÁ EXISTEM (preenche CPF/telefone faltantes; nunca sobrescreve
//       o que já tem, nunca cria aluno novo), casando por e-mail ou CPF.
//
// Uso (a partir de apps/web):
//   node scripts/_guru-backfill-transacoes.mjs            # DRY-RUN (não grava nada; só relatório)
//   node scripts/_guru-backfill-transacoes.mjs --apply    # aplica (grava eventos + enriquece alunos)
//   MESES=12 por padrão; TENANT=<uuid> para outro tenant.
//
// Seguro: eventos são aditivos + dedup; enriquecimento só preenche vazios e gera backup JSON do antes.

import { readFileSync, writeFileSync } from 'node:fs'
import { createDecipheriv, createHash } from 'node:crypto'
import pg from 'pg'

const APPLY = process.argv.includes('--apply')
const MESES = Number(process.env.MESES || 12)
const TENANT = process.env.TENANT || '02195fa6-3db8-49d0-8c07-d21328a26a13'

const env = readFileSync('.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^"|"$/g, '')
const DB = get('DATABASE_URL'); const KEY = get('APP_ENCRYPTION_KEY')
if (!DB) { console.error('sem DATABASE_URL'); process.exit(1) }

function chave() { if (/^[0-9a-fA-F]{64}$/.test(KEY)) return Buffer.from(KEY, 'hex'); return createHash('sha256').update(KEY).digest() }
function dec(v) { if (!v || !v.startsWith('enc:v1:')) return v; const [, , iv, tag, ct] = v.split(':'); const d = createDecipheriv('aes-256-gcm', chave(), Buffer.from(iv, 'base64')); d.setAuthTag(Buffer.from(tag, 'base64')); return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8') }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const soDig = (s) => (s || '').replace(/\D/g, '')
const ymd = (d) => d.toISOString().slice(0, 10)
// Datas da API vêm em unix (segundos) ou já ISO → normaliza p/ ISO (bate com o webhook).
const toIso = (v) => {
  if (v == null) return null
  if (typeof v === 'number') return new Date(v * 1000).toISOString()
  if (/^\d+$/.test(String(v))) return new Date(Number(v) * 1000).toISOString()
  return v
}
function normalizarDatas(p) {
  const d = p?.dates
  if (d && typeof d === 'object') { const nd = {}; for (const [k, v] of Object.entries(d)) nd[k] = toIso(v); p.dates = nd }
  return p
}

const pool = new pg.Pool({ connectionString: DB, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, max: 4 })

async function cfgGuru() {
  const r = await pool.query("SELECT base_url, credenciais FROM simulado_integracao_config WHERE tenant_id=$1 AND provider='guru'", [TENANT])
  if (!r.rows[0]) throw new Error('sem config guru p/ o tenant')
  return { base: (r.rows[0].base_url || 'https://digitalmanager.guru').replace(/\/+$/, ''), token: dec(r.rows[0].credenciais?.api_token) }
}

// Janelas de ≤180 dias cobrindo os últimos MESES meses (em ordem).
function janelas() {
  const hoje = new Date()
  const ini = new Date(hoje); ini.setMonth(ini.getMonth() - MESES)
  const out = []
  let a = new Date(ini)
  while (a < hoje) {
    const b = new Date(a); b.setDate(b.getDate() + 179)
    out.push([ymd(a), ymd(b > hoje ? hoje : b)])
    a = new Date(b); a.setDate(a.getDate() + 1)
  }
  return out
}

async function puxarTransacoes(base, token) {
  const todas = []
  for (const [ini, fim] of janelas()) {
    let cursor = null, pag = 0
    const vistos = new Set()
    for (;;) {
      const u = new URL(base + '/api/v2/transactions')
      u.searchParams.set('ordered_at_ini', ini); u.searchParams.set('ordered_at_end', fim)
      if (cursor) u.searchParams.set('cursor', cursor)
      let j
      try {
        const resp = await fetch(u.toString(), { headers: { accept: 'application/json', Authorization: 'Bearer ' + token }, cache: 'no-store' })
        if (!resp.ok) { console.warn(`  janela ${ini}..${fim} pág${pag} -> HTTP ${resp.status}`); break }
        j = await resp.json()
      } catch (e) { console.warn('  erro de rede:', e.message); break }
      const arr = Array.isArray(j) ? j : (j.data ?? j.transactions ?? j.items ?? [])
      for (const s of arr) todas.push(s)
      pag++
      cursor = j?.next_cursor ?? j?.meta?.next_cursor ?? j?.links?.next ?? null
      const mais = j?.has_more_pages ?? j?.has_more ?? !!cursor
      process.stdout.write(`\r  ${ini}..${fim}: ${pag} pág, ${todas.length} transações  `)
      if (!mais || !cursor || vistos.has(cursor) || pag > 2000) break
      vistos.add(cursor)
      await sleep(1100) // ≈55 req/min (limite da Guru é 60/min) — gentil com o tráfego real
    }
    process.stdout.write('\n')
  }
  return todas
}

function eventoDe(s) {
  const p = normalizarDatas({ ...s })
  const id = s.id ?? s.internal_id ?? s.code
  const status = s.status ?? 'approved'
  if (!id) return null
  return { event_id: `${id}:${status}`, tipo: 'transaction', status: 'processado', payload: p, recebido_em: p?.dates?.confirmed_at ?? p?.dates?.ordered_at ?? new Date().toISOString() }
}

async function main() {
  console.log(`== Backfill Guru transações | tenant ${TENANT} | ${MESES} meses | ${APPLY ? 'APPLY' : 'DRY-RUN'} ==`)
  const { base, token } = await cfgGuru()
  console.log('janelas:', janelas().map((w) => w.join('..')).join('  '))
  const txs = await puxarTransacoes(base, token)
  console.log(`\nTotal de transações puxadas: ${txs.length}`)

  // ── Eventos: quais são NOVOS (não existem por event_id) ──
  const eventos = txs.map(eventoDe).filter(Boolean)
  const eids = [...new Set(eventos.map((e) => e.event_id))]
  const jaRows = eids.length ? (await pool.query("SELECT event_id FROM simulado_integracao_eventos WHERE provider='guru' AND event_id = ANY($1)", [eids])).rows : []
  const ja = new Set(jaRows.map((r) => r.event_id))
  const novos = eventos.filter((e) => !ja.has(e.event_id))
  // dedup interno (mesma transação em 2 páginas)
  const novosUnicos = [...new Map(novos.map((e) => [e.event_id, e])).values()]
  console.log(`Eventos: ${eventos.length} | já existem: ${ja.size} | NOVOS a inserir: ${novosUnicos.length}`)

  // ── Enriquecimento: contatos únicos × alunos existentes ──
  const contatos = new Map() // chave email|cpf -> {email,cpf,phone,name}
  for (const s of txs) {
    const c = s.contact || {}
    const email = (c.email || '').trim().toLowerCase() || null
    const cpf = soDig(c.doc) || null
    const phone = (c.phone_local_code && c.phone_number) ? `${c.phone_local_code}${c.phone_number}` : (c.phone_number || c.phone || null)
    const name = c.name || null
    if (!email && !cpf) continue
    const k = email || cpf
    if (!contatos.has(k)) contatos.set(k, { email, cpf, phone, name })
    else { const o = contatos.get(k); o.cpf = o.cpf || cpf; o.phone = o.phone || phone; o.name = o.name || name }
  }
  const emails = [...new Set([...contatos.values()].map((c) => c.email).filter(Boolean))]
  const cpfs = [...new Set([...contatos.values()].map((c) => c.cpf).filter(Boolean))]
  const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o }
  const alunos = []
  for (const g of chunk(emails, 300)) if (g.length) alunos.push(...(await pool.query('SELECT id, email, cpf, telefone FROM simulado_estudantes WHERE tenant_id=$1 AND deletado=false AND lower(email) = ANY($2)', [TENANT, g])).rows)
  for (const g of chunk(cpfs, 300)) if (g.length) alunos.push(...(await pool.query("SELECT id, email, cpf, telefone FROM simulado_estudantes WHERE tenant_id=$1 AND deletado=false AND regexp_replace(COALESCE(cpf,''),'\\D','','g') = ANY($2)", [TENANT, g])).rows)
  const porEmail = new Map(), porCpf = new Map()
  for (const a of alunos) { if (a.email) porEmail.set(a.email.trim().toLowerCase(), a); if (a.cpf) porCpf.set(soDig(a.cpf), a) }

  const updates = new Map() // id -> {cpf?, telefone?}
  const backup = []
  for (const c of contatos.values()) {
    const al = (c.email && porEmail.get(c.email)) || (c.cpf && porCpf.get(c.cpf))
    if (!al) continue
    const u = {}
    if (!soDig(al.cpf) && c.cpf) u.cpf = c.cpf
    if (!al.telefone && c.phone) u.telefone = c.phone
    if (!Object.keys(u).length) continue
    if (!updates.has(al.id)) { updates.set(al.id, u); backup.push({ id: al.id, antes: { cpf: al.cpf, telefone: al.telefone } }) }
  }
  console.log(`Alunos existentes casados: ${new Set(alunos.map((a) => a.id)).size} | a enriquecer (CPF/telefone faltando): ${updates.size}`)

  if (!APPLY) {
    console.log('\nDRY-RUN — nada foi gravado. Rode com --apply para aplicar.')
    await pool.end(); return
  }

  // ── Aplica: insere eventos (ON CONFLICT DO NOTHING) + enriquece alunos ──
  let inseridos = 0
  for (const g of chunk(novosUnicos, 200)) {
    const vals = [], params = []
    g.forEach((e, i) => {
      const b = i * 7
      vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6}::jsonb,$${b + 7})`)
      params.push(TENANT, 'guru', e.event_id, e.tipo, e.status, JSON.stringify(e.payload), e.recebido_em)
    })
    const r = await pool.query(
      `INSERT INTO simulado_integracao_eventos (tenant_id, provider, event_id, tipo, status, payload, recebido_em)
       VALUES ${vals.join(',')} ON CONFLICT (provider, event_id) DO NOTHING`, params)
    inseridos += r.rowCount
  }
  let enriquecidos = 0
  for (const [id, u] of updates) {
    const sets = [], params = []
    if (u.cpf) { params.push(u.cpf); sets.push(`cpf=$${params.length}`) }
    if (u.telefone) { params.push(u.telefone); sets.push(`telefone=$${params.length}`) }
    params.push(id)
    await pool.query(`UPDATE simulado_estudantes SET ${sets.join(', ')}, atualizado_em=now() WHERE id=$${params.length}`, params)
    enriquecidos++
  }
  writeFileSync('scripts/_backup-guru-backfill-enriquecimento.json', JSON.stringify(backup, null, 2))
  console.log(`\nAPLICADO: eventos inseridos=${inseridos} | alunos enriquecidos=${enriquecidos}`)
  console.log('Backup do antes em scripts/_backup-guru-backfill-enriquecimento.json')
  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
