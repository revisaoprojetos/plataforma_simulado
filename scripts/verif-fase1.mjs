// Verificação TOTAL da Fase 1a/1b contra o banco de produção (twdr). Só leitura.
import { readFileSync } from 'node:fs'
const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL'), KEY = get('SUPABASE_SERVICE_ROLE_KEY')
const H = { apikey: KEY, authorization: `Bearer ${KEY}` }
const rest = async (p) => { const r = await fetch(`${URL}/rest/v1/${p}`, { headers: H }); return { status: r.status, body: await r.json().catch(() => null) } }

console.log('projeto:', (URL.match(/https:\/\/([a-z0-9]+)\./) || [])[1])

// 1) A tabela é LEGÍVEL via service role? (RLS ligado sem policy — service role deve bypassar)
console.log('\n=== 1) leitura de simulado_super_admins (service role) ===')
const sa = await rest('simulado_super_admins?select=user_id,criado_em')
console.log('HTTP', sa.status, '| linhas:', Array.isArray(sa.body) ? sa.body.length : JSON.stringify(sa.body).slice(0, 200))
if (!Array.isArray(sa.body) || sa.body.length === 0) { console.log('❌ FALHA: tabela vazia/ilegível → isSuperAdmin() sempre false (gate falharia fechado)'); process.exit(1) }

// 2) Quem são os super-admins? (resolve email pelo auth admin API)
console.log('\n=== 2) super-admins globais (email) ===')
for (const row of sa.body) {
  const r = await fetch(`${URL}/auth/v1/admin/users/${row.user_id}`, { headers: H })
  const u = await r.json().catch(() => null)
  console.log(' -', u?.email ?? '(email não resolvido)', '| id', row.user_id)
}

// 3) Simula a query EXATA do helper isSuperAdmin() p/ o dono
console.log('\n=== 3) query exata do helper (user_id=eq.<dono>) ===')
const dono = sa.body[0].user_id
const q = await rest(`simulado_super_admins?select=user_id&user_id=eq.${dono}`)
console.log('HTTP', q.status, '| retorno:', JSON.stringify(q.body), '→ isSuperAdmin =', Array.isArray(q.body) && q.body.length === 1 ? 'TRUE ✅' : 'FALSE ❌')

// 4) Acesso do dono nos tenants (pra saber se o /admin completo funciona pra ele)
console.log('\n=== 4) tenant_acessos do dono (papéis por plataforma) ===')
const ac = await rest(`simulado_tenant_acessos?select=tenant_id,role,ativo&user_id=eq.${dono}`)
if (Array.isArray(ac.body) && ac.body.length) for (const a of ac.body) console.log(' - tenant', a.tenant_id, '| role', a.role, '| ativo', a.ativo)
else console.log(' (sem papel em nenhum tenant → entra só como super-admin, vê Plataformas + itens sem permissão)')

// 5) Panorama de plataformas
console.log('\n=== 5) plataformas cadastradas ===')
const ts = await rest('simulado_tenants?select=id,slug,nome,ativo&order=created_at')
if (Array.isArray(ts.body)) for (const t of ts.body) console.log(' -', t.slug, '|', t.nome, '| ativo', t.ativo, '| id', t.id)

console.log('\n=== FIM ===')
