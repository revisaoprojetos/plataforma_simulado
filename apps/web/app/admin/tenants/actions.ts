'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { isSuperAdmin } from '@/lib/auth/permissions'
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
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }

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
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_tenants').update({ ativo }).eq('id', id)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: ativo ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_tenants', entidadeId: id, tenantId: id, depois: { ativo } })
  revalidatePath('/admin/tenants')
  return { ok: true }
}

interface EditarTenant {
  nome: string
  slug: string
  plano: string
}

export async function updateTenantAction(id: string, data: EditarTenant): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
  const nome = data.nome.trim()
  const slug = data.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
  if (!nome || !slug) return { ok: false, error: 'Informe nome e subdomínio (slug).' }

  const svc = createAdminClient()
  const { data: antes } = await svc.from('simulado_tenants').select('nome, slug, plano').eq('id', id).maybeSingle()
  const { error } = await svc.from('simulado_tenants').update({ nome, slug, plano: data.plano || 'basico' }).eq('id', id)
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return { ok: false, error: 'Já existe uma plataforma com esse subdomínio.' }
    return { ok: false, error: error.message }
  }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenants', entidadeId: id, tenantId: id, antes: antes ?? undefined, depois: { nome, slug, plano: data.plano } })
  revalidatePath('/admin/tenants'); revalidatePath('/super/plataformas'); revalidatePath(`/super/plataformas/${id}`)
  return { ok: true }
}

// Exclusão com SALVAGUARDAS (destrutivo e irreversível): exige que a plataforma esteja
// OCULTA (inativa), que o nome digitado confira, e que esteja VAZIA (sem estudantes nem
// simulados) — evita perda catastrófica de dados. Plataforma com conteúdo deve ser esvaziada
// antes (ou apenas ocultada).
export async function deleteTenantAction(id: string, confirmNome: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
  const svc = createAdminClient()

  const { data: tenant } = await svc.from('simulado_tenants').select('nome, slug, ativo').eq('id', id).maybeSingle()
  if (!tenant) return { ok: false, error: 'Plataforma não encontrada.' }
  if ((confirmNome ?? '').trim() !== tenant.nome) return { ok: false, error: 'O nome digitado não confere com o da plataforma.' }
  if (tenant.ativo) return { ok: false, error: 'Oculte (desative) a plataforma antes de excluí-la.' }

  // Bloqueia se houver conteúdo real.
  const [{ count: estudantes }, { count: simulados }] = await Promise.all([
    svc.from('simulado_estudantes').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
    svc.from('simulado_simulados').select('id', { count: 'exact', head: true }).eq('tenant_id', id),
  ])
  if ((estudantes ?? 0) > 0 || (simulados ?? 0) > 0) {
    return { ok: false, error: `Plataforma não está vazia (${estudantes ?? 0} estudante(s), ${simulados ?? 0} simulado(s)). Remova o conteúdo antes de excluir.` }
  }

  // Remove vínculos administrativos e a plataforma. Erros de FK (dados vinculados) são reportados.
  await svc.from('simulado_tenant_acessos').delete().eq('tenant_id', id)
  const { error } = await svc.from('simulado_tenants').delete().eq('id', id)
  if (error) return { ok: false, error: `Não foi possível excluir (dados vinculados?): ${error.message}` }

  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_tenants', entidadeId: id, antes: { nome: tenant.nome, slug: tenant.slug } })
  revalidatePath('/admin/tenants'); revalidatePath('/super/plataformas')
  return { ok: true }
}

function gerarSenha() {
  // Senha forte aleatória (exibida uma única vez no painel).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s + '@1'
}
