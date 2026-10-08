// Ativa o LOGIN NOVO (branded / PlatformLogin) para VND e MEQ, escolhendo a variante.
// Faz MERGE em simulado_tenants.tema.aparencia_auth (preserva internoAtivo/loading/defaultTheme etc.).
//   VND → vnd-login-centralizado   |   MEQ → meq-login-circuito
// Lê credenciais de apps/web/.env.local (SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
// Uso: node scripts/login-novo-ativar.mjs

import { readFileSync } from 'node:fs'

let env = ''
try { env = readFileSync('apps/web/.env.local', 'utf8') } catch {}
const get = (k) => (process.env[k] ?? env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
if (!URL || !KEY) { console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em apps/web/.env.local'); process.exit(1) }
const H = { apikey: KEY, authorization: 'Bearer ' + KEY, 'content-type': 'application/json' }
const rest = (p, opt = {}) => fetch(URL + '/rest/v1/' + p, { headers: H, ...opt })

// (slug do tenant → { brand, loginStyle }) — variantes escolhidas pelo usuário.
const ALVOS = [
  { slug: 'vnd', brand: 'vnd', loginStyle: 'vnd-login-centralizado' },
  { slug: 'meq', brand: 'meq', loginStyle: 'meq-login-circuito' },
]

for (const a of ALVOS) {
  const rows = await (await rest(`simulado_tenants?select=id,slug,nome,tema&slug=eq.${encodeURIComponent(a.slug)}`)).json()
  const t = rows?.[0]
  if (!t) { console.log(`✗ tenant slug=${a.slug} não encontrado`); continue }
  const tema = (t.tema && typeof t.tema === 'object') ? t.tema : {}
  const ap = (tema.aparencia_auth && typeof tema.aparencia_auth === 'object') ? tema.aparencia_auth : {}
  const antes = { loginAtivo: ap.loginAtivo ?? false, brand: ap.brand ?? null, loginStyle: ap.loginStyle ?? null, internoAtivo: ap.internoAtivo ?? null }
  const novoAp = { ...ap, brand: a.brand, loginAtivo: true, loginStyle: a.loginStyle }
  const novoTema = { ...tema, aparencia_auth: novoAp }
  const resp = await rest(`simulado_tenants?id=eq.${t.id}`, {
    method: 'PATCH',
    headers: { ...H, Prefer: 'return=minimal' },
    body: JSON.stringify({ tema: novoTema }),
  })
  if (!resp.ok) { console.log(`✗ ${t.slug} (${t.nome}): PATCH falhou ${resp.status} ${await resp.text()}`); continue }
  console.log(`✓ ${t.slug} (${t.nome})`)
  console.log(`   antes:  loginAtivo=${antes.loginAtivo} brand=${antes.brand} loginStyle=${antes.loginStyle} (internoAtivo=${antes.internoAtivo})`)
  console.log(`   depois: loginAtivo=true brand=${a.brand} loginStyle=${a.loginStyle} (internoAtivo preservado)`)
}
console.log('\nPronto. Login novo ativado — abra /aluno/entrar no domínio de cada plataforma p/ conferir.')
