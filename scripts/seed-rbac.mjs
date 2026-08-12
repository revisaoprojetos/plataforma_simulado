// Seed RBAC — roda UMA VEZ (não no caminho de render). Semeia o catálogo de permissões,
// os cargos de sistema (admin/super_admin) por tenant e garante admin@teste.com como super-admin.
// Uso: node scripts/seed-rbac.mjs            (todos os tenants)
//      node scripts/seed-rbac.mjs <tenantId> (só um tenant)
import { readFileSync } from 'node:fs'

const env = readFileSync('apps/web/.env.local', 'utf8')
const get = (k) => (env.match(new RegExp('^' + k + '=(.*)$', 'm'))?.[1] ?? '').trim()
const URL = get('SUPABASE_URL') || get('NEXT_PUBLIC_SUPABASE_URL')
const KEY = get('SUPABASE_SERVICE_ROLE_KEY')
if (!URL || !KEY) { console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em apps/web/.env.local'); process.exit(1) }
const H = { apikey: KEY, authorization: 'Bearer ' + KEY, 'content-type': 'application/json' }
const rest = (p, opt = {}) => fetch(URL + '/rest/v1/' + p, { headers: H, ...opt })
const json = (r) => r.json()

// Espelha apps/web/lib/rbac-catalogo.ts (permissões que o app realmente verifica).
const CATALOGO = [
  ['questoes', 'view'], ['questoes', 'create'], ['questoes', 'update'],
  ['simulados', 'view'], ['simulados', 'create'], ['simulados', 'update'], ['simulados', 'delete'],
  ['estudantes', 'view'], ['estudantes', 'create'], ['estudantes', 'update'], ['estudantes', 'delete'],
  ['grupos', 'view'],
  ['matriculas', 'view'], ['matriculas', 'create'], ['matriculas', 'update'], ['matriculas', 'delete'],
  ['integracoes', 'view'], ['integracoes', 'manage'],
  ['relatorios', 'view'], ['relatorios', 'export'],
  ['gamificacao', 'view'], ['gamificacao', 'manage'],
  ['auditoria', 'view'], ['auditoria', 'export'],
  ['configuracoes', 'view'], ['configuracoes', 'manage'],
  ['api_keys', 'manage'],
  ['rbac', 'view'], ['rbac', 'manage'], ['console', 'view'],
].map(([resource, action]) => ({ resource, action }))

const alvo = process.argv[2] || null

async function main() {
  // 1) Catálogo de permissões (insere só o que falta).
  const perms = await json(await rest('simulado_permissions?select=resource,action'))
  const have = new Set((perms ?? []).map((p) => `${p.resource}:${p.action}`))
  const faltando = CATALOGO.filter((p) => !have.has(`${p.resource}:${p.action}`))
  if (faltando.length) {
    const r = await rest('simulado_permissions', { method: 'POST', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify(faltando) })
    console.log(`permissions: +${faltando.length} (HTTP ${r.status})`)
  } else console.log('permissions: já completo')

  // 2) Cargos de sistema (admin/super_admin) por tenant.
  const tenants = alvo
    ? [{ id: alvo }]
    : await json(await rest('simulado_tenants?select=id'))
  for (const t of tenants ?? []) {
    const roles = await json(await rest(`simulado_roles?select=nome&tenant_id=eq.${t.id}`))
    const nomes = new Set((roles ?? []).map((r) => r.nome))
    const base = [
      { nome: 'admin', descricao: 'Administrador (acesso total ao painel)' },
      { nome: 'super_admin', descricao: 'Super administrador (acesso total, não editável)' },
    ].filter((r) => !nomes.has(r.nome)).map((r) => ({ tenant_id: t.id, nome: r.nome, descricao: r.descricao, is_sistema: true }))
    if (base.length) {
      const r = await rest('simulado_roles', { method: 'POST', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify(base) })
      console.log(`tenant ${t.id}: +${base.length} cargo(s) (HTTP ${r.status})`)
    }
  }

  // 3) Todo super-admin GLOBAL (simulado_super_admins) deve aparecer como role=super_admin nos
  //    acessos por-tenant — independe de estar em simulado_users (o login vive no auth do Supabase).
  const sas = await json(await rest('simulado_super_admins?select=user_id'))
  const saIds = new Set((sas ?? []).map((s) => s.user_id))
  let ajustados = 0
  for (const uid of saIds) {
    const acessos = await json(await rest(`simulado_tenant_acessos?select=tenant_id,role&user_id=eq.${uid}${alvo ? `&tenant_id=eq.${alvo}` : ''}`))
    for (const a of acessos ?? []) {
      if (a.role !== 'super_admin') {
        await rest(`simulado_tenant_acessos?user_id=eq.${uid}&tenant_id=eq.${a.tenant_id}`, { method: 'PATCH', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify({ role: 'super_admin' }) })
        ajustados++
      }
    }
  }
  console.log(`super-admins: ${saIds.size} conta(s), ${ajustados} acesso(s) elevado(s) a super_admin`)

  console.log('Seed RBAC concluído.')
}
main().catch((e) => { console.error(e); process.exit(1) })
