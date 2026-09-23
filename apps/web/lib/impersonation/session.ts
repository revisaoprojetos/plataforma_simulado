import 'server-only'
import { cookies } from 'next/headers'
import { assinarTokenImpersonation, verificarTokenImpersonation, COOKIE_IMPERSONATION, type ImpersonationClaims, type ImpersonationScope, type ImpersonationActionLevel } from './token'

export interface ImpersonationSession {
  estudanteId: string
  tenantId: string
  nome: string
  impersonatedBy: string
  sessionId: string
  scope: ImpersonationScope
  actionLevel: ImpersonationActionLevel
}

/** Grava o cookie httpOnly da visualização (separado do aluno real). Reusa os atributos do
 *  `aluno_session` (Partitioned/None em prod) p/ funcionar dentro do iframe. */
export async function criarSessaoImpersonation(claims: ImpersonationClaims, ttlSeg: number): Promise<{ expiresAt: string }> {
  const { token, exp } = await assinarTokenImpersonation(claims, ttlSeg)
  const emProducao = process.env.NODE_ENV === 'production'
  const jar = await cookies()
  jar.set(COOKIE_IMPERSONATION, token, {
    httpOnly: true,
    secure: emProducao,
    sameSite: emProducao ? 'none' : 'lax',
    partitioned: emProducao || undefined,
    path: '/',
    maxAge: ttlSeg,
  })
  return { expiresAt: new Date(exp * 1000).toISOString() }
}

/** Lê a sessão de visualização do cookie (ou null). */
export async function lerSessaoImpersonation(): Promise<ImpersonationSession | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE_IMPERSONATION)?.value
  if (!token) return null
  const c = await verificarTokenImpersonation(token)
  if (!c) return null
  return {
    estudanteId: c.sub, tenantId: c.tenantId, nome: c.nome,
    impersonatedBy: c.impersonated_by, sessionId: c.session_id,
    scope: c.scope, actionLevel: c.action_level,
  }
}

export async function limparSessaoImpersonation(): Promise<void> {
  const emProducao = process.env.NODE_ENV === 'production'
  const jar = await cookies()
  jar.set(COOKIE_IMPERSONATION, '', {
    httpOnly: true,
    secure: emProducao,
    sameSite: emProducao ? 'none' : 'lax',
    partitioned: emProducao || undefined,
    path: '/',
    maxAge: 0,
  })
}
