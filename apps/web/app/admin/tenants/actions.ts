'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { checkPermission } from '@/lib/auth/permissions'
import { seedTenantDefaults } from '@/lib/auth/onboard-tenant'
import { registrarAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

interface NovoTenant {
  nome: string
  slug: string
  plano: string
  admin_email: string
  admin_senha?: string
}

export async function createTenantAction(data: NovoTenant): Promise<{ ok: boolean; error?: string; senha?: string }> {
  if (!(await checkPermission('tenants:manage'))) return { ok: false, error: 'Você não tem permissão para gerenciar plataformas.' }

  const nome = data.nome.trim()
  const slug = data.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  const email = data.admin_email.trim().toLowerCase()
  if (!nome || !slug) return { ok: false, error: 'Informe nome e subdomínio (slug).' }
  if (!email) return { ok: false, error: 'Informe o e-mail do administrador inicial.' }

  const svc = createAdminClient()

  // 1) Cria o tenant
  const { data: tenant, error: tErr } = await svc
    .from('simulado_tenants')
    .insert({ nome, slug, plano: data.plano || 'basico', ativo: true })
    .select('id')
    .single()

  if (tErr) {
    if (/duplicate|unique/i.test(tErr.message)) return { ok: false, error: 'Já existe uma plataforma com esse subdomínio.' }
    return { ok: false, error: tErr.message }
  }

  // 2) Onboarding: perfis, mensagens, contatos, embed
  await seedTenantDefaults(svc, tenant.id)

  // 3) Cria/garante o admin inicial e vincula como admin
  const senha = data.admin_senha?.trim() || gerarSenha()
  let userId: string | null = null

  const { data: novo, error: aErr } = await svc.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: `Admin ${nome}` },
  })
  if (aErr && !/already.*registered|already.*exists/i.test(aErr.message)) {
    return { ok: false, error: `Tenant criado, mas falhou ao criar admin: ${aErr.message}` }
  }
  userId = novo?.user?.id ?? null
  if (!userId) {
    const { data: list } = await svc.auth.admin.listUsers()
    userId = list.users.find((u) => u.email === email)?.id ?? null
  }

  if (userId) {
    await svc.from('simulado_tenant_acessos').upsert(
      { user_id: userId, tenant_id: tenant.id, role: 'admin', ativo: true },
      { onConflict: 'user_id,tenant_id' },
    )
  }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_tenants', entidadeId: tenant.id, depois: { nome, slug, plano: data.plano, admin_email: email } })

  revalidatePath('/admin/tenants')
  // Só retorna a senha se foi gerada automaticamente (para exibir uma vez).
  return { ok: true, senha: data.admin_senha?.trim() ? undefined : senha }
}

export async function toggleTenantAtivoAction(id: string, ativo: boolean): Promise<{ ok: boolean; error?: string }> {
  if (!(await checkPermission('tenants:manage'))) return { ok: false, error: 'Sem permissão.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_tenants').update({ ativo }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/tenants')
  return { ok: true }
}

function gerarSenha() {
  // Senha forte aleatória (exibida uma única vez no painel).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s + '@1'
}
