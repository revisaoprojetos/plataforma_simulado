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

  // Embed (iframe cross-site, ex.: app da Curseduca no MOBILE): não basta SameSite=None+Secure.
  // Navegadores modernos particionam/bloqueiam cookies de terceiros — no mobile (iOS Safari,
  // Android WebView) o cookie some e o portal cai no login. A solução cross-browser é o
  // atributo `Partitioned` (CHIPS): o cookie é aceito e enviado DENTRO do iframe, particionado
  // pelo site que embeda. Em dev (HTTP) mantemos Lax (None/Partitioned exigem Secure).
  const emProducao = process.env.NODE_ENV === 'production'
  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: emProducao,
    sameSite: emProducao ? 'none' : 'lax',
    partitioned: emProducao || undefined, // CHIPS: cookie particionado p/ funcionar em iframe de terceiro
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
  const emProducao = process.env.NODE_ENV === 'production'
  const jar = await cookies()
  // Sobrescreve com os MESMOS atributos (inclusive Partitioned) p/ o navegador remover de fato.
  jar.set(COOKIE, '', {
    httpOnly: true,
    secure: emProducao,
    sameSite: emProducao ? 'none' : 'lax',
    partitioned: emProducao || undefined,
    path: '/',
    maxAge: 0,
  })
}
