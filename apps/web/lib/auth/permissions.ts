import { cache } from 'react'
import { createClient, createAdminClient } from '@/lib/supabase/server'
import { getCurrentTenantId } from '@/lib/tenant'

export interface Access {
  userId: string | null
  tenantId: string | null
  role: string | null
  isAdmin: boolean
  permissions: string[] // "resource:action"
}

/**
 * Cache CURTO em memória (por processo) das consultas de PAPEL/PERMISSÃO — a validação do token (getUser) continua a cada
 * request. Sem isto, cada chamada de API admin gastava ~3 idas ao banco só para provar o acesso (~0,6 s de piso, mesmo com
 * a rota 100% cacheada). Efeito colateral aceito: mudança de papel/permissão/super-admin leva até TTL_ACESSO_MS para valer.
 */
const TTL_ACESSO_MS = 15_000
const memoAcesso = new Map<string, { at: number; v: Promise<any> }>()
function comMemo<T>(chave: string, fn: () => Promise<T>): Promise<T> {
  const agora = Date.now()
  const e = memoAcesso.get(chave)
  if (e && agora - e.at < TTL_ACESSO_MS) return e.v
  const v = fn().catch((err) => { memoAcesso.delete(chave); throw err })
  memoAcesso.set(chave, { at: agora, v })
  if (memoAcesso.size > 500) for (const [k, x] of memoAcesso) if (agora - x.at >= TTL_ACESSO_MS) memoAcesso.delete(k)
  return v
}

const EMPTY: Access = { userId: null, tenantId: null, role: null, isAdmin: false, permissions: [] }

/**
 * Consulta a tabela simulado_super_admins via service role (bypassa RLS). Tolerante:
 * tabela ausente/erro → false. `function` (não arrow) para poder ser usada em
 * getCurrentAccess mesmo estando declarada depois (hoisting).
 */
async function consultarSuperAdmin(svc: ReturnType<typeof createAdminClient>, userId: string): Promise<boolean> {
  try {
    const { data } = await svc.from('simulado_super_admins').select('user_id').eq('user_id', userId).maybeSingle()
    return !!data
  } catch {
    return false
  }
}

/**
 * getUser() memoizado por REQUEST. O layout do /admin + getCurrentAccess + isSuperAdmin chamam
 * isto no mesmo render; sem cache seriam 3 validações de token (ida à rede) por navegação.
 */
export const getAuthUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/** Checagem de super-admin memoizada por userId/request (isSuperAdmin e getCurrentAccess batem nos dois). */
const superAdminMemo = cache((userId: string): Promise<boolean> => comMemo(`sa:${userId}`, () => consultarSuperAdmin(createAdminClient(), userId)))

/**
 * Resolve o acesso do usuário atual: papel (de tenant_acessos) + permissões
 * (roles → role_permissions → permissions). Papel "admin" tem acesso total.
 */
export const getCurrentAccess = cache(async (): Promise<Access> => {
  const user = await getAuthUser()
  if (!user) return EMPTY
  // tenant (por host) e super-admin não dependem um do outro: em PARALELO (antes eram 2 idas em fila)
  const [tenantId, ehSuper] = await Promise.all([getCurrentTenantId(), superAdminMemo(user.id)])

  // Super-admin GLOBAL (acima dos tenants): acesso TOTAL a QUALQUER plataforma — inclusive quando o
  // tenant NÃO resolve (entrada neutra / subdomínio sem tenant mapeado). Precisa vir ANTES do guard
  // de tenant abaixo: senão um `tenantId` nulo zerava o acesso do super-admin (menu vazio + "sem
  // acesso"). Usa service role REAL (createAdminClient), que bypassa RLS.
  if (ehSuper) {
    return { userId: user.id, tenantId, role: 'super_admin', isAdmin: true, permissions: ['*'] }
  }

  if (!tenantId) return { ...EMPTY, userId: user.id, tenantId: null }

  // Service role REAL: a checagem do próprio acesso (filtrada por user_id+tenant_id) não
  // pode depender do RLS do banco — em bancos com RLS incompleto (migrados), createServiceClient
  // rodaria como o usuário e falharia, zerando o acesso do admin.
  const svc = createAdminClient()

  const chaveAcesso = `ac:${user.id}:${tenantId}`
  const { data: acesso, error: erroAcesso } = await comMemo(chaveAcesso, async () => await svc
    .from('simulado_tenant_acessos')
    .select('role')
    .eq('user_id', user.id)
    .eq('tenant_id', tenantId)
    .eq('ativo', true)
    .maybeSingle())
  if (erroAcesso) memoAcesso.delete(chaveAcesso) // falha transitória nunca fica em cache

  const role = (acesso?.role as string | undefined) ?? null
  if (!role) return { ...EMPTY, userId: user.id, tenantId }

  // Admin do tenant = acesso total (não depende de seed de permissões).
  if (role === 'admin' || role === 'super_admin' || role === 'admin_geral') {
    return { userId: user.id, tenantId, role, isAdmin: true, permissions: ['*'] }
  }

  // Demais papéis: resolve permissões em consultas explícitas (sem join embutido).
  let permissions: string[] = []
  try {
    permissions = await comMemo(`pm:${tenantId}:${role}`, async () => {
    let perms: string[] = []
    const { data: roleRows } = await svc.from('simulado_roles').select('id, tenant_id, is_sistema').eq('nome', role)
    const roleRow = (roleRows ?? []).find((r: any) => r.tenant_id === tenantId || r.is_sistema)

    if (roleRow?.id) {
      const { data: rp } = await svc.from('simulado_role_permissions').select('permission_id').eq('role_id', roleRow.id)
      const permIds = (rp ?? []).map((r: any) => r.permission_id).filter(Boolean)
      if (permIds.length) {
        const { data: pms } = await svc.from('simulado_permissions').select('resource, action').in('id', permIds)
        perms = (pms ?? []).map((p: any) => `${p.resource}:${p.action}`)
      }
    }
    return perms
    })
  } catch {
    /* tabelas RBAC indisponíveis — sem permissões extras */
  }

  return { userId: user.id, tenantId, role, isAdmin: false, permissions }
})

/**
 * Super-admin GLOBAL (tabela simulado_super_admins, sem tenant) — acima de todas as
 * plataformas. Controla gestão de plataformas, entrada neutra e compartilhamento.
 * Ortogonal ao papel por-tenant: não depende do subdomínio atual. Resolvido via service
 * role real (nunca confia no cliente). Tolerante: se a tabela ainda não foi aplicada,
 * retorna false (ninguém é super-admin) — seguro por padrão.
 */
export const isSuperAdmin = cache(async (): Promise<boolean> => {
  const user = await getAuthUser()
  if (!user) return false
  return superAdminMemo(user.id)
})

/** Verifica uma permissão sobre um Access já resolvido. */
export function accessCan(access: Access, permission: string): boolean {
  if (access.isAdmin) return true
  if (access.permissions.includes('*')) return true
  return access.permissions.includes(permission)
}

/** Helper para server actions: resolve o acesso e checa a permissão. */
export async function checkPermission(permission: string): Promise<boolean> {
  const access = await getCurrentAccess()
  return accessCan(access, permission)
}
