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
// DEVE bater 1:1 com o RBAC_CATALOGO do app — manter em sincronia.
const CATALOGO = [
  ['questoes', 'view'], ['questoes', 'create'], ['questoes', 'update'],
  ['leitura', 'view'], ['leitura', 'create'], ['leitura', 'update'], ['leitura', 'delete'], ['leitura', 'publicar'],
  ['correcao', 'view'], ['correcao', 'corrigir'],
  ['simulados', 'view'], ['simulados', 'create'], ['simulados', 'update'], ['simulados', 'delete'],
  ['estudantes', 'view'], ['estudantes', 'create'], ['estudantes', 'update'], ['estudantes', 'delete'],
  ['grupos', 'view'],
  ['matriculas', 'view'], ['matriculas', 'create'], ['matriculas', 'update'], ['matriculas', 'delete'],
  ['produtos', 'view'], ['produtos', 'create'], ['produtos', 'update'], ['produtos', 'manage'],
  ['liberacao', 'view'], ['liberacao', 'manage'],
  ['biblioteca', 'view'], ['biblioteca', 'create'], ['biblioteca', 'update'], ['biblioteca', 'publicar'],
  ['flashcards', 'view'], ['flashcards', 'create'], ['flashcards', 'update'], ['flashcards', 'manage'],
  ['trilhas', 'view'], ['trilhas', 'create'], ['trilhas', 'update'], ['trilhas', 'manage'],
  ['classificacao', 'view'], ['classificacao', 'manage'],
  ['integracoes', 'view'], ['integracoes', 'manage'],
  ['relatorios', 'view'], ['relatorios', 'export'],
  ['gamificacao', 'view'], ['gamificacao', 'manage'],
  ['auditoria', 'view'], ['auditoria', 'export'],
  ['configuracoes', 'view'], ['configuracoes', 'manage'],
  ['api_keys', 'manage'],
  ['rbac', 'view'], ['rbac', 'manage'], ['console', 'view'],
  ['armazenamento', 'view'], ['armazenamento', 'manage'],
  ['cronogramas', 'view'], ['cronogramas', 'create'], ['cronogramas', 'update'],
  ['cronogramas', 'delete'], ['cronogramas', 'liberar'], ['cronogramas', 'emitir'],
].map(([resource, action]) => ({ resource, action }))

// Papel-semente `professor` (self-service da área de Conteúdos). Espelha PROFESSOR_PERMS em
// apps/web/lib/auth/onboard-tenant.ts e a migration 20261031000000_rbac_professor_conteudos.sql.
const PROFESSOR_DESC = 'Professor (conteúdo: questões, biblioteca, flashcards, trilhas, produtos)'
const PROFESSOR_PERMS = [
  'questoes:view', 'questoes:create', 'questoes:update',
  'simulados:view', 'simulados:create', 'simulados:update', 'simulados:delete',
  'biblioteca:view', 'biblioteca:create', 'biblioteca:update', 'biblioteca:publicar',
  'leitura:view', 'leitura:create', 'leitura:update', 'leitura:publicar',
  'flashcards:view', 'flashcards:create', 'flashcards:update', 'flashcards:manage',
  'trilhas:view', 'trilhas:create', 'trilhas:update', 'trilhas:manage',
  'classificacao:view', 'classificacao:manage',
  'produtos:view', 'produtos:create', 'produtos:update', 'produtos:manage',
  'liberacao:view', 'liberacao:manage',
  'grupos:view', 'estudantes:view', 'matriculas:view', 'relatorios:view',
]

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

  // IDs de permissão por "resource:action" (inclui as recém-inseridas) — para vincular ao papel professor.
  const permsFull = await json(await rest('simulado_permissions?select=id,resource,action'))
  const permId = new Map((permsFull ?? []).map((p) => [`${p.resource}:${p.action}`, p.id]))

  // 2) Cargos de sistema (admin/super_admin) + papel-semente `professor` por tenant.
  const tenants = alvo
    ? [{ id: alvo }]
    : await json(await rest('simulado_tenants?select=id'))
  for (const t of tenants ?? []) {
    const roles = await json(await rest(`simulado_roles?select=id,nome&tenant_id=eq.${t.id}`))
    const byNome = new Map((roles ?? []).map((r) => [r.nome, r.id]))

    // 2a) admin/super_admin: acesso total, não dependem da matriz de permissões.
    const base = [
      { nome: 'admin', descricao: 'Administrador (acesso total ao painel)' },
      { nome: 'super_admin', descricao: 'Super administrador (acesso total, não editável)' },
    ].filter((r) => !byNome.has(r.nome)).map((r) => ({ tenant_id: t.id, nome: r.nome, descricao: r.descricao, is_sistema: true }))
    if (base.length) {
      const r = await rest('simulado_roles', { method: 'POST', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify(base) })
      console.log(`tenant ${t.id}: +${base.length} cargo(s) de sistema (HTTP ${r.status})`)
    }

    // 2b) professor: papel editável (is_sistema=false) + permissões de Conteúdos.
    let profId = byNome.get('professor')
    if (!profId) {
      const ins = await json(await rest('simulado_roles', {
        method: 'POST', headers: { ...H, prefer: 'return=representation' },
        body: JSON.stringify({ tenant_id: t.id, nome: 'professor', descricao: PROFESSOR_DESC, is_sistema: false }),
      }))
      profId = Array.isArray(ins) ? ins[0]?.id : ins?.id
      if (profId) console.log(`tenant ${t.id}: +papel professor`)
    }
    if (profId) {
      const existentes = await json(await rest(`simulado_role_permissions?select=permission_id&role_id=eq.${profId}`))
      const have = new Set((existentes ?? []).map((x) => x.permission_id))
      const novos = PROFESSOR_PERMS
        .map((k) => permId.get(k))
        .filter((id) => id && !have.has(id))
        .map((permission_id) => ({ role_id: profId, permission_id }))
      if (novos.length) {
        const r = await rest('simulado_role_permissions', { method: 'POST', headers: { ...H, prefer: 'return=minimal' }, body: JSON.stringify(novos) })
        console.log(`tenant ${t.id}: professor +${novos.length} permissão(ões) (HTTP ${r.status})`)
      }
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
