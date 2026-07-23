'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { revalidatePath } from 'next/cache'

export interface AdminMembro {
  userId: string
  nome: string | null
  email: string | null
  cargo: string
  ativo: boolean
  criadoEm: string | null
  ehVoce: boolean
}
export interface CargoOpcao { nome: string; descricao: string | null; is_sistema: boolean }

// Cargos que dão acesso TOTAL ao painel (não dependem da matriz de permissões).
const CARGOS_ACESSO_TOTAL = new Set(['admin', 'super_admin', 'admin_geral'])
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function gerarSenha() {
  // Senha forte aleatória (exibida uma única vez no painel).
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s + '@1'
}

/**
 * Lista os membros da equipe do tenant (linhas de simulado_tenant_acessos) com
 * nome/e-mail resolvidos do auth (fonte autoritativa — admins podem não ter perfil),
 * além dos cargos disponíveis para atribuir.
 */
export async function listarAdministradores(): Promise<{ ok: boolean; error?: string; membros?: AdminMembro[]; cargos?: CargoOpcao[] }> {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'rbac:manage')) return { ok: false, error: 'Sem permissão.' }
  const tenantId = access.tenantId
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  const svc = createAdminClient()

  const { data: acessos, error } = await svc
    .from('simulado_tenant_acessos')
    .select('user_id, role, ativo, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: true })
  if (error) return { ok: false, error: error.message }

  const membros: AdminMembro[] = await Promise.all((acessos ?? []).map(async (a: any) => {
    let email: string | null = null
    let nome: string | null = null
    try {
      const { data } = await svc.auth.admin.getUserById(a.user_id)
      email = data?.user?.email ?? null
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>
      nome = (meta.full_name as string) ?? (meta.nome as string) ?? null
    } catch { /* fonte auth indisponível — mostra só o id/cargo */ }
    return {
      userId: a.user_id as string,
      nome, email,
      cargo: (a.role as string) ?? 'estudante',
      ativo: !!a.ativo,
      criadoEm: (a.created_at as string) ?? null,
      ehVoce: a.user_id === access.userId,
    }
  }))

  // Cargos = perfis do próprio tenant + perfis de sistema (mesma fonte do RBAC).
  const { data: roles } = await svc
    .from('simulado_roles')
    .select('nome, descricao, is_sistema')
    .or(`tenant_id.eq.${tenantId},is_sistema.eq.true`)
    .order('is_sistema', { ascending: false })
    .order('nome')
  const cargos: CargoOpcao[] = (roles ?? []).map((r: any) => ({ nome: r.nome, descricao: r.descricao ?? null, is_sistema: !!r.is_sistema }))
  // Garante 'admin' disponível mesmo que a matriz ainda não tenha sido semeada neste tenant.
  if (!cargos.some((c) => c.nome === 'admin')) cargos.unshift({ nome: 'admin', descricao: 'Administrador geral (acesso total)', is_sistema: true })

  const ord = (x: AdminMembro, y: AdminMembro) => (x.nome ?? x.email ?? '').localeCompare(y.nome ?? y.email ?? '', 'pt-BR')
  return { ok: true, membros: membros.sort(ord), cargos }
}

/**
 * Cria (ou reaproveita) um usuário global e concede acesso ao tenant com o cargo escolhido.
 * Retorna a senha gerada apenas quando o usuário é NOVO e a senha foi gerada automaticamente.
 */
export async function criarAdministradorAction(
  data: { nome: string; email: string; cargo: string; senha?: string },
): Promise<{ ok: boolean; error?: string; senha?: string; jaExistia?: boolean }> {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'rbac:manage')) return { ok: false, error: 'Sem permissão.' }
  const tenantId = access.tenantId
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }

  const nome = data.nome?.trim()
  const email = data.email?.trim().toLowerCase()
  const cargo = data.cargo?.trim()
  if (!nome) return { ok: false, error: 'Informe o nome.' }
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'Informe um e-mail válido.' }
  if (!cargo) return { ok: false, error: 'Selecione um cargo.' }

  const svc = createAdminClient()
  const senha = data.senha?.trim() || gerarSenha()

  // 1) Cria/garante o usuário global (auth.users). Se já existe, apenas localiza o id.
  let jaExistia = false
  const { data: novo, error: aErr } = await svc.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { full_name: nome },
  })
  if (aErr && !/already.*registered|already.*exists/i.test(aErr.message)) {
    return { ok: false, error: aErr.message }
  }
  let userId = novo?.user?.id ?? null
  if (!userId) {
    jaExistia = true
    const { data: list } = await svc.auth.admin.listUsers()
    userId = list.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null
  }
  if (!userId) return { ok: false, error: 'Não foi possível criar ou localizar o usuário.' }

  // 2) Espelha o perfil (best-effort — a lista lê do auth, isto é só conveniência).
  try {
    await svc.from('simulado_users').upsert({ id: userId, email, nome }, { onConflict: 'id' })
  } catch { /* simulado_users indisponível */ }

  // 3) Concede/atualiza o acesso ao tenant com o cargo escolhido (idempotente).
  const { error: acErr } = await svc.from('simulado_tenant_acessos').upsert(
    { user_id: userId, tenant_id: tenantId, role: cargo, ativo: true },
    { onConflict: 'user_id,tenant_id' },
  )
  if (acErr) return { ok: false, error: acErr.message }

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_tenant_acessos', entidadeId: userId, depois: { email, cargo, nome, ja_existia: jaExistia } })
  revalidatePath('/admin/administradores')

  // Só faz sentido exibir a senha quando ela foi gerada agora para um usuário novo.
  const mostrarSenha = !data.senha?.trim() && !jaExistia
  return { ok: true, jaExistia, senha: mostrarSenha ? senha : undefined }
}

/** Altera o cargo (perfil) de um membro. Bloqueia auto-rebaixamento (anti-lockout). */
export async function trocarCargoAction(userId: string, cargo: string): Promise<{ ok: boolean; error?: string }> {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'rbac:manage')) return { ok: false, error: 'Sem permissão.' }
  const tenantId = access.tenantId
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  if (!cargo?.trim()) return { ok: false, error: 'Cargo inválido.' }
  if (userId === access.userId && !CARGOS_ACESSO_TOTAL.has(cargo)) {
    return { ok: false, error: 'Você não pode rebaixar o seu próprio cargo (evita se trancar para fora).' }
  }
  const svc = createAdminClient()
  const { data: antes } = await svc.from('simulado_tenant_acessos').select('role').eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle()
  const { error } = await svc.from('simulado_tenant_acessos').update({ role: cargo }).eq('user_id', userId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenant_acessos', entidadeId: userId, antes: antes ?? undefined, depois: { role: cargo } })
  revalidatePath('/admin/administradores')
  return { ok: true }
}

/** Ativa/desativa o acesso de um membro. Bloqueia auto-desativação (anti-lockout). */
export async function toggleAtivoAdminAction(userId: string, ativo: boolean): Promise<{ ok: boolean; error?: string }> {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'rbac:manage')) return { ok: false, error: 'Sem permissão.' }
  const tenantId = access.tenantId
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  if (userId === access.userId && !ativo) return { ok: false, error: 'Você não pode desativar o seu próprio acesso.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_tenant_acessos').update({ ativo }).eq('user_id', userId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: ativo ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_tenant_acessos', entidadeId: userId, depois: { ativo } })
  revalidatePath('/admin/administradores')
  return { ok: true }
}

/**
 * Redefine a senha do membro (login global). Se `senha` vier vazia, gera uma aleatória.
 * A senha efetiva é retornada para exibição única no painel.
 */
export async function resetarSenhaAdminAction(userId: string, senha?: string): Promise<{ ok: boolean; error?: string; senha?: string; gerada?: boolean }> {
  const access = await getCurrentAccess()
  if (!accessCan(access, 'rbac:manage')) return { ok: false, error: 'Sem permissão.' }
  const tenantId = access.tenantId
  if (!tenantId) return { ok: false, error: 'Tenant não resolvido.' }

  const digitada = senha?.trim()
  if (digitada && digitada.length < 6) return { ok: false, error: 'A senha deve ter ao menos 6 caracteres.' }

  const svc = createAdminClient()
  // Confirma que o alvo pertence a esta plataforma (não resetar senha de fora do tenant).
  const { data: alvo } = await svc.from('simulado_tenant_acessos').select('user_id').eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle()
  if (!alvo) return { ok: false, error: 'Usuário não pertence a esta plataforma.' }

  const gerada = !digitada
  const nova = digitada || gerarSenha()
  const { error } = await svc.auth.admin.updateUserById(userId, { password: nova })
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenant_acessos', entidadeId: userId, depois: { senha_resetada: true, gerada } })
  return { ok: true, senha: nova, gerada }
}
