// Busca um e-mail na Curseduca (nos grupos de acesso configurados no sync) e, com --apply,
// adiciona o aluno ao sistema (espelha o executarImport para 1 membro novo).
// A API não tem busca por e-mail — varremos os grupos e filtramos localmente (--all = todos os canais).
// Uso: node scripts/_buscar-curseduca-aluno.mjs [email] [--apply] [--all]
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// ── env ──
const env = {}
for (const f of ['.env.local', '../../.env', '.env']) {
  try { for (const l of readFileSync(f, 'utf8').split(/\r?\n/)) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^"|"$/g, '') } } catch {}
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const T = '02195fa6-3db8-49d0-8c07-d21328a26a13' // Revisão
const APPLY = process.argv.includes('--apply')
const EMAIL = (process.argv.find((a) => a.includes('@')) || 'flavialiris@gmail.com').trim().toLowerCase()

// ── Curseduca mínimo ──
const BASE = env.CURSEDUCA_BASE_URL || 'https://prof.curseduca.pro'
const API_KEY = env.CURSEDUCA_API_KEY, USER = env.CURSEDUCA_USER, PASS = env.CURSEDUCA_PASS
if (!(API_KEY && USER && PASS)) { console.error('Credenciais CURSEDUCA_* ausentes no .env.local'); process.exit(1) }
let TOKEN = null
async function login() {
  const r = await fetch(`${BASE}/login`, { method: 'POST', headers: { accept: 'application/json', 'content-type': 'application/json', api_key: API_KEY }, body: JSON.stringify({ username: USER, password: PASS, device: { app: { uuid: 'revisao' }, device: 'server', registrationToken: 'server' } }) })
  if (!r.ok) throw new Error(`login ${r.status}`)
  TOKEN = (await r.json()).accessToken
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
async function api(path) {
  for (let t = 0; t < 4; t++) {
    let r = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json', api_key: API_KEY, Authorization: `Bearer ${TOKEN}` } })
    if (r.status === 401) { await login(); r = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json', api_key: API_KEY, Authorization: `Bearer ${TOKEN}` } }) }
    if (r.ok) return r.json()
    if ([429, 500, 502, 503, 504].includes(r.status)) { await dormir(500 * 2 ** t + Math.random() * 250); continue }
    throw new Error(`${path} ${r.status}`)
  }
  throw new Error(`${path} falhou`)
}
const soDig = (s) => (s ? String(s).replace(/\D/g, '') : '')
const cpfDe = (d) => d == null ? null : (typeof d === 'string' ? (soDig(d) || null) : (soDig(d?.value) || null))
const telDe = (p) => { if (!p) return null; if (typeof p === 'string') return soDig(p) || null; const t = [p.countryCode, p.areaCode, p.number].map(soDig).join(''); return t || null }
const ehVital = (n) => { const s = (n ?? '').toLowerCase(); return /vital[ií]cio/.test(s) && /passaporte|\bpasse\b/.test(s) && !/amostra|gr[aá]tis|gratuit|trial|degusta|\bfree\b/.test(s) }
const ehPass = (n) => { const s = (n ?? '').toLowerCase(); return /passaporte|\bpasse\b/.test(s) && !/amostra|gr[aá]tis|gratuit|trial|degusta|\bfree\b/.test(s) }

async function main() {
  console.log(`\n== Buscando "${EMAIL}" (tenant Revisão) ==`)

  // 1) Já existe no sistema? (principal + secundários)
  const { data: ex1 } = await sb.from('simulado_estudantes').select('id, nome, email, emails_secundarios, cpf, telefone, classificacao, matricula_externa, deletado').eq('tenant_id', T).eq('email', EMAIL)
  const { data: ex2 } = await sb.from('simulado_estudantes').select('id, nome, email, emails_secundarios, cpf, telefone, classificacao, matricula_externa, deletado').eq('tenant_id', T).contains('emails_secundarios', [EMAIL])
  const jaExiste = [...(ex1 || []), ...(ex2 || [])]
  if (jaExiste.length) { console.log('JÁ EXISTE no sistema:', JSON.stringify(jaExiste, null, 2)) }
  else console.log('Não encontrada no simulado_estudantes (nem principal nem secundário).')

  // 2) Grupos de sync configurados
  const { data: syncRows } = await sb.from('simulado_curseduca_sync').select('grupos, destino, sincronizar').eq('tenant_id', T)
  const grupos = [...new Set((syncRows || []).flatMap((r) => (r.grupos ?? []).map(Number)).filter(Number.isFinite))]
  console.log(`Grupos de sync configurados: ${grupos.length}`)

  await login()

  // A API da Curseduca NÃO tem busca de membro por e-mail/nome (GET /members só aceita
  // limit/offset/groupId/situation/startCreatedAt/endCreatedAt — o `?search=` é IGNORADO e devolve
  // membros arbitrários). Então a única forma correta é PAGINAR um grupo e filtrar localmente.
  const ALL = process.argv.includes('--all')
  let membro = null
  const gruposOndeEsta = []

  const varrer = async (gid) => {
    let offset = 0
    try {
      for (let p = 0; p < 100; p++) {
        const j = await api(`/members?groupId=${gid}&limit=200&offset=${offset}`)
        const data = j.data || []
        const hit = data.find((m) => (m.email || '').trim().toLowerCase() === EMAIL)
        if (hit) { membro = membro || hit; gruposOndeEsta.push(gid); return true }
        if (!j.metadata?.hasMore || data.length === 0) break
        offset += 200
      }
    } catch (e) { console.log(`  (grupo ${gid} falhou: ${e.message} — pulando)`) }
    return false
  }

  console.log('Varrendo os grupos de sync configurados…')
  for (const gid of grupos) { if (await varrer(gid)) break }

  // Não achou nos configurados: com --all, varre TODOS os canais da Curseduca (mais lento).
  if (!membro && ALL) {
    console.log('Não achou nos configurados — varrendo TODOS os canais (--all)…')
    const todos = []
    { let off = 0; for (let p = 0; p < 30; p++) { const j = await api(`/groups?limit=100&offset=${off}`); const d = j.data || []; todos.push(...d.map((g) => g.id)); if (!j.metadata?.hasMore || !d.length) break; off += 100 } }
    for (const gid of todos) { if (grupos.includes(gid)) continue; if (await varrer(gid)) break }
  } else if (!membro && !ALL) {
    console.log('(Dica: rode com --all para varrer TODOS os canais, não só os configurados.)')
  }

  if (!membro) { console.log('\n>>> NÃO ENCONTRADA na Curseduca nos grupos de acesso configurados.'); return }

  // 4) Grupos/CPF/telefone: a LISTA já traz tudo (groups/document/phone). Detalhe só como FALLBACK
  //    quando a lista veio sem grupos ou sem CPF para este membro (mesma lógica do executarImport).
  const grDaLista = Array.isArray(membro.groups) ? membro.groups.map((g) => g?.name ?? g?.group?.name).filter(Boolean) : []
  const precisaDet = !grDaLista.length || !cpfDe(membro.document)
  const det = precisaDet ? await api(`/members/${membro.id}`).then((j) => j?.data ?? j).catch(() => null) : null
  const gruposNomes = grDaLista.length ? grDaLista : (Array.isArray(det?.groups) ? det.groups.map((g) => g?.group?.name ?? g?.name).filter(Boolean) : [])
  const cpf = cpfDe(membro.document) ?? cpfDe(det?.document)
  const telefone = telDe(membro.phone) ?? telDe(det?.phone)
  const classificacao = gruposNomes.some(ehVital) ? 'vitalicio' : gruposNomes.some(ehPass) ? 'passaporte' : 'normal'

  console.log('\n>>> ENCONTRADA na Curseduca:')
  console.log(JSON.stringify({ id: membro.id, nome: (membro.name || '').trim(), email: (membro.email || '').trim().toLowerCase(), situacao: membro.situation ?? null, cpf, telefone, gruposOndeEsta, gruposNomes, classificacao }, null, 2))

  if (jaExiste.length) { console.log('\n(Já está no sistema — nada a inserir.)'); return }
  if (!APPLY) { console.log('\nDRY-RUN (sem --apply). Nada gravado. Rode com --apply para adicionar.'); return }

  // 5) Insere o estudante (espelha executarImport p/ membro novo)
  const row = { tenant_id: T, user_id: null, nome: (membro.name || membro.email || 'Aluno').trim(), email: (membro.email || '').trim().toLowerCase(), cpf, telefone, classificacao, matricula_externa: String(membro.id) }
  const { data: ins, error: eIns } = await sb.from('simulado_estudantes').insert(row).select('id').single()
  if (eIns) { console.error('Erro ao inserir:', eIns.message); process.exit(1) }
  const estId = ins.id
  console.log(`\nInserida: estudante_id=${estId}`)

  // 6) Vincula aos grupos do sistema (passaporte/vitalício) conforme classificação
  async function entrarNoGrupo(nomeIlike) {
    const { data: gr } = await sb.from('simulado_grupos').select('id, nome').eq('tenant_id', T).eq('deletado', false).eq('is_mestre', false).ilike('nome', nomeIlike).limit(1).maybeSingle()
    if (!gr?.id) { console.log(`  grupo "${nomeIlike}" não encontrado — pulei`); return }
    const { data: ja } = await sb.from('simulado_grupo_membros').select('estudante_id').eq('grupo_id', gr.id).eq('estudante_id', estId).maybeSingle()
    if (ja) { console.log(`  já está no grupo "${gr.nome}"`); return }
    const { error } = await sb.from('simulado_grupo_membros').insert({ tenant_id: T, grupo_id: gr.id, estudante_id: estId })
    console.log(error ? `  erro ao vincular a "${gr.nome}": ${error.message}` : `  vinculada ao grupo "${gr.nome}"`)
  }
  if (classificacao === 'passaporte' || classificacao === 'vitalicio') await entrarNoGrupo('passaporte')
  if (classificacao === 'vitalicio') await entrarNoGrupo('Passaporte Vitalício')
  console.log('\nOK — aluno adicionado.')
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
