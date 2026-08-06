// Cria/remove um admin de teste DESCARTÁVEL no twdr (só para tirar screenshots do painel).
// Uso: node scripts/temp-admin.mjs create   |   node scripts/temp-admin.mjs delete
import { readFileSync } from 'node:fs'

const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}`, 'content-type': 'application/json' }

const EMAIL = 'screenshot-bot@teste.com'
const SENHA = 'ScreenBot@2026x'
const TENANT = '02195fa6-3db8-49d0-8c07-d21328a26a13'
const acao = process.argv[2]

async function acharUser() {
  const r = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers: H })
  const j = await r.json()
  return (j.users ?? []).find((u) => u.email === EMAIL) ?? null
}

if (acao === 'create') {
  let user = await acharUser()
  if (!user) {
    const r = await fetch(`${URL}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email: EMAIL, password: SENHA, email_confirm: true, user_metadata: { full_name: 'Screenshot Bot' } }) })
    user = await r.json()
    if (!r.ok) { console.error('erro criar:', JSON.stringify(user).slice(0, 200)); process.exit(1) }
  } else {
    await fetch(`${URL}/auth/v1/admin/users/${user.id}`, { method: 'PUT', headers: H, body: JSON.stringify({ password: SENHA }) })
  }
  const up = await fetch(`${URL}/rest/v1/simulado_tenant_acessos?on_conflict=user_id,tenant_id`, {
    method: 'POST', headers: { ...H, Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ user_id: user.id, tenant_id: TENANT, role: 'admin', ativo: true }),
  })
  if (!up.ok) console.error('aviso acesso:', up.status, (await up.text()).slice(0, 150))
  console.log('ADMIN DE TESTE PRONTO:', EMAIL, '(id', user.id + ')')
} else if (acao === 'delete') {
  const user = await acharUser()
  if (!user) { console.log('nada a apagar'); process.exit(0) }
  await fetch(`${URL}/rest/v1/simulado_tenant_acessos?user_id=eq.${user.id}&tenant_id=eq.${TENANT}`, { method: 'DELETE', headers: H })
  const d = await fetch(`${URL}/auth/v1/admin/users/${user.id}`, { method: 'DELETE', headers: H })
  console.log('ADMIN DE TESTE APAGADO:', d.status)
} else {
  console.log('uso: node scripts/temp-admin.mjs create|delete')
}
