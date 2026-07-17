import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const COOKIE = 'aluno_session'
const MAX_AGE = 60 * 60 * 24 * 7 // 7 dias

function secret() {
  return new TextEncoder().encode(
    process.env.ALUNO_SESSION_SECRET ??
      process.env.SUPABASE_SERVICE_ROLE_KEY ??
      'dev-secret-troque-em-producao',
  )
}

export interface AlunoSession {
  estudanteId: string
  tenantId: string
  nome: string
  email?: string
}

/** Cria a sessão persistente do aluno (cookie httpOnly assinado). */
export async function criarSessaoAluno(s: AlunoSession): Promise<void> {
  const token = await new SignJWT({ ...s })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret())

  // Embed (iframe cross-site, ex.: Curseduca): o navegador só ARMAZENA e ENVIA o cookie
  // de sessão num contexto de terceiro se for SameSite=None + Secure. Em produção (HTTPS)
  // usamos None; em dev (HTTP) mantemos Lax porque None exige Secure (que não vale em http).
  const emProducao = process.env.NODE_ENV === 'production'
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: emProducao,
    sameSite: emProducao ? 'none' : 'lax',
    path: '/',
    maxAge: MAX_AGE,
  })
}

/** Lê e valida a sessão do aluno. Retorna null se ausente/inválida/expirada. */
export async function getSessaoAluno(): Promise<AlunoSession | null> {
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE)?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, secret())
    if (!payload.estudanteId || !payload.tenantId) return null
    return {
      estudanteId: String(payload.estudanteId),
      tenantId: String(payload.tenantId),
      nome: String(payload.nome ?? 'Aluno'),
      email: payload.email ? String(payload.email) : undefined,
    }
  } catch {
    return null
  }
}

export async function limparSessaoAluno(): Promise<void> {
  const jar = await cookies()
  jar.delete(COOKIE)
}
