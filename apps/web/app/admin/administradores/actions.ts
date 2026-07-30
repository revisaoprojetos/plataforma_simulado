'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan, isSuperAdmin } from '@/lib/auth/permissions'
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
 * Localiza o id de um usuário auth pelo e-mail — PAGINANDO. O `listUsers()` sem args só traz a 1ª
 * página (~50), então um e-mail já existente (ex.: tentativa anterior) não era encontrado e a
 * criação falhava com "não foi possível localizar o usuário". Percorre páginas de 1000 até achar.
 */
async function acharUserIdPorEmail(svc: ReturnType<typeof createAdminClient>, email: string): Promise<string | null> {
  const alvo = email.toLowerCase()
  for (let page = 1; page <= 30; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 1000 })
    if (error || !data?.users?.length) return null
    const u = data.users.find((x) => x.email?.toLowerCase() === alvo)
    if (u) return u.id
    if (data.users.length < 1000) return null
  }
  return null
}

/**
 * Resolve o CONTEXTO da ação de RBAC.
 * - `tenantIdAlvo` presente → modo CONSOLE SUPER: exige super-admin global e opera na
 *   plataforma-alvo (o super gerencia o RBAC de qualquer tenant a partir de /super).
 * - ausente → modo painel do tenant: exige `rbac:manage` e opera no tenant logado.
 * `userId` é o do ator (para o anti-lockout de auto-rebaixamento/desativação).
 */
async function resolverContexto(tenantIdAlvo?: string):
  Promise<{ ok: true; tenantId: string; userId: string | null; ehSuper: boolean } | { ok: false; error: string }> {
  if (tenantIdAlvo) {
    if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
    const access = await getCurrentAccess()
    return { ok: true, tenantId: tenantIdAlvo, userId: access.userId ?? null, ehSuper: true }
  }
  const access = await getCurrentAccess()
  if (!accessCan(access, 'rbac:manage')) return { ok: false, error: 'Sem permissão.' }
  if (!access.tenantId) return { ok: false, error: 'Tenant não resolvido.' }
  return { ok: true, tenantId: access.tenantId, userId: access.userId ?? null, ehSuper: false }
}

function revalidarRbac(tenantId: string, ehSuper: boolean) {
  if (ehSuper) revalidatePath(`/super/plataformas/${tenantId}`)
  else revalidatePath('/admin/administradores')
}

/**
 * Lista os membros da equipe do tenant (linhas de simulado_tenant_acessos) com
 * nome/e-mail resolvidos do auth (fonte autoritativa — admins podem não ter perfil),
 * além dos cargos disponíveis para atribuir.
 */
export async function listarAdministradores(tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string; membros?: AdminMembro[]; cargos?: CargoOpcao[] }> {
  const ctx = await resolverContexto(tenantIdAlvo)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { tenantId, userId } = ctx
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
      ehVoce: a.user_id === userId,
    }
  }))

  // Cargos = perfis do próprio tenant + perfis de sistema (mesma fonte do RBAC).
  const { data: roles } = await svc
    .from('simulado_roles')
    .select('nome, descricao, is_sistema')
    .or(`tenant_id.eq.${tenantId},is_sistema.eq.true`)
    .order('is_sistema', { ascending: false })
    .order('nome')
  // DEDUPE por nome: bancos migrados têm cargos de sistema repetidos (cada tenant semeou seu
  // admin/super_admin com is_sistema=true, e o `.or(is_sistema.eq.true)` traz todos) — senão o
  // seletor de cargo mostra "Administrador"/"Super Admin" várias vezes.
  const vistos = new Set<string>()
  const cargos: CargoOpcao[] = []
  for (const r of roles ?? []) {
    const nomeR = (r as any).nome as string
    if (!nomeR || vistos.has(nomeR)) continue
    vistos.add(nomeR)
    cargos.push({ nome: nomeR, descricao: (r as any).descricao ?? null, is_sistema: !!(r as any).is_sistema })
  }
  // Garante 'admin' disponível mesmo que a matriz ainda não tenha sido semeada neste tenant.
  if (!vistos.has('admin')) cargos.unshift({ nome: 'admin', descricao: 'Administrador geral (acesso total)', is_sistema: true })

  const ord = (x: AdminMembro, y: AdminMembro) => (x.nome ?? x.email ?? '').localeCompare(y.nome ?? y.email ?? '', 'pt-BR')
  return { ok: true, membros: membros.sort(ord), cargos }
}

/**
 * Cria (ou reaproveita) um usuário global e concede acesso ao tenant com o cargo escolhido.
 * Retorna a senha gerada apenas quando o usuário é NOVO e a senha foi gerada automaticamente.
 */
export async function criarAdministradorAction(
  data: { nome: string; email: string; cargo: string; senha?: string },
  tenantIdAlvo?: string,
): Promise<{ ok: boolean; error?: string; senha?: string; jaExistia?: boolean }> {
  const ctx = await resolverContexto(tenantIdAlvo)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { tenantId } = ctx

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
    userId = await acharUserIdPorEmail(svc, email)
  }
  if (!userId) return { ok: false, error: 'Não foi possível criar ou localizar o usuário.' }

  // Conta reaproveitada (já existia): o createUser NÃO atualiza o metadata, então o nome digitado
  // não era gravado e o admin aparecia SEM NOME (a lista lê o nome do auth.user_metadata.full_name).
  // Garante o nome (e sincroniza se mudou).
  if (jaExistia && nome) {
    try { await svc.auth.admin.updateUserById(userId, { user_metadata: { full_name: nome } }) } catch { /* best-effort */ }
  }

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

  await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_tenant_acessos', entidadeId: userId, tenantId, depois: { email, cargo, nome, ja_existia: jaExistia } })
  revalidarRbac(tenantId, ctx.ehSuper)

  // Só faz sentido exibir a senha quando ela foi gerada agora para um usuário novo.
  const mostrarSenha = !data.senha?.trim() && !jaExistia
  return { ok: true, jaExistia, senha: mostrarSenha ? senha : undefined }
}

/** Altera o cargo (perfil) de um membro. Bloqueia auto-rebaixamento (anti-lockout). */
export async function trocarCargoAction(userId: string, cargo: string, tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolverContexto(tenantIdAlvo)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { tenantId } = ctx
  if (!cargo?.trim()) return { ok: false, error: 'Cargo inválido.' }
  if (userId === ctx.userId && !CARGOS_ACESSO_TOTAL.has(cargo)) {
    return { ok: false, error: 'Você não pode rebaixar o seu próprio cargo (evita se trancar para fora).' }
  }
  const svc = createAdminClient()
  const { data: antes } = await svc.from('simulado_tenant_acessos').select('role').eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle()
  const { error } = await svc.from('simulado_tenant_acessos').update({ role: cargo }).eq('user_id', userId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenant_acessos', entidadeId: userId, tenantId, antes: antes ?? undefined, depois: { role: cargo } })
  revalidarRbac(tenantId, ctx.ehSuper)
  return { ok: true }
}

/** Ativa/desativa o acesso de um membro (soft — preserva o cadastro). Bloqueia auto-desativação. */
export async function toggleAtivoAdminAction(userId: string, ativo: boolean, tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolverContexto(tenantIdAlvo)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { tenantId } = ctx
  if (userId === ctx.userId && !ativo) return { ok: false, error: 'Você não pode desativar o seu próprio acesso.' }
  const svc = createAdminClient()
  const { error } = await svc.from('simulado_tenant_acessos').update({ ativo }).eq('user_id', userId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: ativo ? 'LIBERAR' : 'BLOQUEAR', entidade: 'simulado_tenant_acessos', entidadeId: userId, tenantId, depois: { ativo } })
  revalidarRbac(tenantId, ctx.ehSuper)
  return { ok: true }
}

/** Atualiza NOME e E-MAIL do membro (conta global no auth + espelho em simulado_users). */
export async function atualizarDadosAdminAction(userId: string, dados: { nome: string; email: string }, tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolverContexto(tenantIdAlvo)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { tenantId } = ctx
  const nome = dados.nome?.trim()
  const email = dados.email?.trim().toLowerCase()
  if (!nome) return { ok: false, error: 'Informe o nome.' }
  if (!email || !EMAIL_RE.test(email)) return { ok: false, error: 'Informe um e-mail válido.' }
  const svc = createAdminClient()
  const { error } = await svc.auth.admin.updateUserById(userId, { email, user_metadata: { full_name: nome } })
  if (error) {
    if (/already.*registered|already.*exists|duplicate|been registered/i.test(error.message)) return { ok: false, error: 'Já existe uma conta com esse e-mail.' }
    return { ok: false, error: error.message }
  }
  try { await svc.from('simulado_users').upsert({ id: userId, email, nome }, { onConflict: 'id' }) } catch { /* espelho best-effort */ }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_users', entidadeId: userId, tenantId, depois: { nome, email } })
  revalidarRbac(tenantId, ctx.ehSuper)
  return { ok: true }
}

/**
 * REMOVE o acesso do membro à plataforma (apaga a linha em tenant_acessos — a conta global
 * permanece). Bloqueia remover a si mesmo (anti-lockout). Diferente de "desativar" (que preserva).
 */
export async function removerAcessoAdminAction(userId: string, tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string }> {
  const ctx = await resolverContexto(tenantIdAlvo)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { tenantId } = ctx
  if (userId === ctx.userId) return { ok: false, error: 'Você não pode remover o seu próprio acesso.' }
  const svc = createAdminClient()
  const { data: antes } = await svc.from('simulado_tenant_acessos').select('role').eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle()
  const { error } = await svc.from('simulado_tenant_acessos').delete().eq('user_id', userId).eq('tenant_id', tenantId)
  if (error) return { ok: false, error: error.message }
  await registrarAudit({ operacao: 'DELETE', entidade: 'simulado_tenant_acessos', entidadeId: userId, tenantId, antes: antes ?? undefined, depois: { removido: true } })
  revalidarRbac(tenantId, ctx.ehSuper)
  return { ok: true }
}

/**
 * Redefine a senha do membro (login global). Se `senha` vier vazia, gera uma aleatória.
 * A senha efetiva é retornada para exibição única no painel.
 */
export async function resetarSenhaAdminAction(userId: string, senha?: string, tenantIdAlvo?: string): Promise<{ ok: boolean; error?: string; senha?: string; gerada?: boolean }> {
  const ctx = await resolverContexto(tenantIdAlvo)
  if (!ctx.ok) return { ok: false, error: ctx.error }
  const { tenantId } = ctx

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
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenant_acessos', entidadeId: userId, tenantId, depois: { senha_resetada: true, gerada } })
  return { ok: true, senha: nova, gerada }
}
