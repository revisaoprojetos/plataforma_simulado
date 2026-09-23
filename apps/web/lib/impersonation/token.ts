import { SignJWT, jwtVerify } from 'jose'

// Módulo EDGE-SAFE (sem next/headers, sem node-only): usado no middleware (Edge) e no servidor.
// Cookie SEPARADO do aluno real (`aluno_session`) e do admin — garante isolamento da visualização.
export const COOKIE_IMPERSONATION = 'aluno_impersonation'

export type ImpersonationScope = 'own_tenant' | 'all_tenants'
export type ImpersonationActionLevel = 'read_only' | 'read_and_act'

export interface ImpersonationClaims {
  sub: string                 // estudanteId (aluno visualizado)
  tenantId: string
  nome: string
  impersonation: true
  impersonated_by: string     // userId do admin
  session_id: string          // id da linha em simulado_impersonation_logs
  scope: ImpersonationScope
  action_level: ImpersonationActionLevel
}

// Mesma chave/algoritmo do JWT do aluno (HS256), mas com claim `impersonation: true` que TODO
// leitor deve checar explicitamente — nunca tratar como sessão de usuário comum.
function secret() {
  return new TextEncoder().encode(
    process.env.ALUNO_SESSION_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      'dev-secret-troque-em-producao',
  )
}

export async function assinarTokenImpersonation(claims: ImpersonationClaims, ttlSeg: number): Promise<{ token: string; exp: number }> {
  const iat = Math.floor(Date.now() / 1000)
  const exp = iat + ttlSeg
  const token = await new SignJWT({ ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt(iat)
    .setExpirationTime(exp)
    .sign(secret())
  return { token, exp }
}

/** Verifica e decodifica o token; retorna null se ausente/inválido/expirado ou sem o claim de impersonation. */
export async function verificarTokenImpersonation(token: string): Promise<ImpersonationClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (payload.impersonation !== true || !payload.sub || !payload.tenantId) return null
    return {
      sub: String(payload.sub),
      tenantId: String(payload.tenantId),
      nome: String(payload.nome ?? 'Aluno'),
      impersonation: true,
      impersonated_by: String(payload.impersonated_by ?? ''),
      session_id: String(payload.session_id ?? ''),
      scope: (payload.scope as ImpersonationScope) ?? 'own_tenant',
      action_level: (payload.action_level as ImpersonationActionLevel) ?? 'read_only',
    }
  } catch {
    return null
  }
}
