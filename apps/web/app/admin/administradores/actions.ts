'use server'

import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan, isSuperAdmin } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { criptografar, descriptografar } from '@/lib/crypto'
import { revalidatePath } from 'next/cache'

export interface AdminMembro {
  userId: string
  nome: string | null
  email: string | null
  cargo: string
  ativo: boolean
  criadoEm: string | null
  ehVoce: boolean
  /** [console super] plataformas (empresas) a que este admin tem acesso — etiquetas na lista. */
  plataformas?: { id: string; nome: string }[]
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
 * [CONSOLE SUPER] Plataformas onde este admin AINDA NÃO tem acesso — candidatas para adicioná-lo.
 * Só super-admin global. Retorna também o cargo ATUAL dele (numa plataforma qualquer) para "importar
 * a função" ao adicionar. Marca as que ele já tem (`ja`) para o super não duplicar.
 */
export async function plataformasParaAdmin(userId: string): Promise<{ ok: boolean; error?: string; plataformas?: { id: string; nome: string; ja: boolean }[] }> {
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
  if (!userId) return { ok: false, error: 'Usuário inválido.' }
  const svc = createAdminClient()
  const [tenantsRes, acessosRes] = await Promise.all([
    svc.from('simulado_tenants').select('id, nome').eq('ativo', true).order('nome', { ascending: true }),
    svc.from('simulado_tenant_acessos').select('tenant_id').eq('user_id', userId),
  ])
  if (tenantsRes.error) return { ok: false, error: tenantsRes.error.message }
  const ja = new Set((acessosRes.data ?? []).map((a: any) => a.tenant_id))
  return { ok: true, plataformas: (tenantsRes.data ?? []).map((t: any) => ({ id: t.id, nome: t.nome, ja: ja.has(t.id) })) }
}

/** [CONSOLE SUPER] Todas as plataformas ATIVAS (para o seletor de adicionar em lote). Só super-admin. */
export async function listarPlataformasSuper(): Promise<{ ok: boolean; error?: string; plataformas?: { id: string; nome: string }[] }> {
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
  const svc = createAdminClient()
  const { data, error } = await svc.from('simulado_tenants').select('id, nome').eq('ativo', true).order('nome', { ascending: true })
  if (error) return { ok: false, error: error.message }
  return { ok: true, plataformas: (data ?? []).map((t: any) => ({ id: t.id, nome: t.nome })) }
}

/**
 * [CONSOLE SUPER] Adiciona um admin a OUTRAS plataformas com o `cargo` informado (importa a função:
 * a UI passa o cargo atual dele, ou um escolhido). Idempotente: pula plataformas onde ele já tem
 * acesso (não sobrescreve o cargo existente). Só super-admin global.
 */
export async function adicionarAdminEmPlataformasAction(userId: string, tenantIds: string[], cargo: string): Promise<{ ok: boolean; error?: string; adicionadas?: number; jaTinha?: number }> {
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
  if (!userId || !Array.isArray(tenantIds) || !tenantIds.length || !cargo?.trim()) return { ok: false, error: 'Selecione ao menos uma plataforma.' }
  const svc = createAdminClient()
  let adicionadas = 0, jaTinha = 0
  for (const tid of [...new Set(tenantIds)]) {
    const { data: existe } = await svc.from('simulado_tenant_acessos').select('user_id').eq('tenant_id', tid).eq('user_id', userId).maybeSingle()
    if (existe) { jaTinha++; continue }
    const { error } = await svc.from('simulado_tenant_acessos').insert({ tenant_id: tid, user_id: userId, role: cargo, ativo: true })
    if (error) continue
    adicionadas++
    await registrarAudit({ operacao: 'INSERT', entidade: 'simulado_tenant_acessos', entidadeId: userId, tenantId: tid, depois: { role: cargo, via: 'super_add_plataforma' } })
    revalidatePath(`/super/plataformas/${tid}`)
  }
  return { ok: true, adicionadas, jaTinha }
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

  // Nome/e-mail: 1 lookup EM LOTE em simulado_users (evita 1 getUserById por membro). Só cai no
  // Auth (getUserById) para os user_ids que ainda não estão em simulado_users — geralmente poucos.
  const userIds = [...new Set((acessos ?? []).map((a: any) => a.user_id).filter(Boolean))] as string[]
  const perfil = new Map<string, { nome: string | null; email: string | null }>()
  if (userIds.length) {
    const { data: us } = await svc.from('simulado_users').select('id, nome, email').in('id', userIds)
    for (const u of (us ?? []) as any[]) perfil.set(u.id, { nome: u.nome ?? null, email: u.email ?? null })
  }
  const faltando = userIds.filter((id) => !perfil.has(id))
  await Promise.all(faltando.map(async (id) => {
    try {
      const { data } = await svc.auth.admin.getUserById(id)
      const meta = (data?.user?.user_metadata ?? {}) as Record<string, unknown>
      perfil.set(id, { nome: (meta.full_name as string) ?? (meta.nome as string) ?? null, email: data?.user?.email ?? null })
    } catch { perfil.set(id, { nome: null, email: null }) }
  }))
  const membros: AdminMembro[] = (acessos ?? []).map((a: any) => {
    const p = perfil.get(a.user_id) ?? { nome: null, email: null }
    return {
      userId: a.user_id as string,
      nome: p.nome, email: p.email,
      cargo: (a.role as string) ?? 'estudante',
      ativo: !!a.ativo,
      criadoEm: (a.created_at as string) ?? null,
      ehVoce: a.user_id === userId,
    }
  })

  // [console super] Etiquetas: plataformas (empresas) de cada admin. 1 lote pelos userIds + nomes dos tenants.
  if (ctx.ehSuper && userIds.length) {
    const { data: acc } = await svc.from('simulado_tenant_acessos').select('user_id, tenant_id').in('user_id', userIds)
    const tids = [...new Set((acc ?? []).map((a: any) => a.tenant_id).filter(Boolean))]
    const nomes = new Map<string, string>()
    if (tids.length) { const { data: ts } = await svc.from('simulado_tenants').select('id, nome').in('id', tids); for (const t of ts ?? []) nomes.set((t as any).id, (t as any).nome) }
    const porUser = new Map<string, { id: string; nome: string }[]>()
    for (const a of (acc ?? []) as any[]) { const arr = porUser.get(a.user_id) ?? []; arr.push({ id: a.tenant_id, nome: nomes.get(a.tenant_id) ?? '—' }); porUser.set(a.user_id, arr) }
    for (const m of membros) m.plataformas = (porUser.get(m.userId) ?? []).sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))
  }

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
  // Isolamento: confirma que o alvo pertence a esta plataforma antes de alterar a conta global
  // (o userId vem do cliente e o updateUserById toca em auth.users — não pode editar de fora do tenant).
  const { data: alvo } = await svc.from('simulado_tenant_acessos').select('user_id').eq('user_id', userId).eq('tenant_id', tenantId).maybeSingle()
  if (!alvo) return { ok: false, error: 'Usuário não pertence a esta plataforma.' }
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
  // COFRE: guarda a senha DEFINIDA aqui, CRIPTOGRAFADA (APP_ENCRYPTION_KEY), p/ o super-admin ver depois.
  // O Auth guarda só o hash (irreversível); o cofre é uma cópia cifrada em repouso — nunca em texto puro.
  // Tolerante: se a tabela/migração ainda não existe, o reset segue funcionando (só não guarda no cofre).
  const ator = (await getCurrentAccess()).userId ?? null
  try {
    await svc.from('simulado_admin_senha_cofre').upsert({ user_id: userId, senha_cripto: criptografar(nova), definido_por: ator, atualizado_em: new Date().toISOString() }, { onConflict: 'user_id' })
  } catch { /* tabela ausente → sem cofre */ }
  await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_tenant_acessos', entidadeId: userId, tenantId, depois: { senha_resetada: true, gerada } })
  return { ok: true, senha: nova, gerada }
}

/**
 * [CONSOLE SUPER] Revela a última senha DEFINIDA pelo painel (cofre cifrado). Só super-admin global.
 * Retorna null se nunca foi definida por aqui (senhas antigas/definidas fora ficam invisíveis — são hash).
 */
export async function verSenhaAdminCofre(userId: string): Promise<{ ok: boolean; error?: string; senha?: string | null; atualizadoEm?: string | null }> {
  if (!(await isSuperAdmin())) return { ok: false, error: 'Ação exclusiva do super-administrador global.' }
  if (!userId) return { ok: false, error: 'Usuário inválido.' }
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_admin_senha_cofre').select('senha_cripto, atualizado_em').eq('user_id', userId).maybeSingle()
    if (!data?.senha_cripto) return { ok: true, senha: null, atualizadoEm: null }
    await registrarAudit({ operacao: 'UPDATE', entidade: 'simulado_admin_senha_cofre', entidadeId: userId, depois: { acao: 'revelou_senha' } }).catch(() => {})
    return { ok: true, senha: descriptografar(data.senha_cripto), atualizadoEm: (data as any).atualizado_em ?? null }
  } catch { return { ok: true, senha: null, atualizadoEm: null } }
}
