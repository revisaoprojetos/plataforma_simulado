import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { lerSessaoImpersonation } from '@/lib/impersonation/session'

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
  /** Preenchido quando um ADMIN está VISUALIZANDO a conta (impersonation). O portal renderiza
   *  normalmente; a proteção read-only é feita globalmente no middleware. Nunca sobrepõe uma
   *  sessão real do aluno. */
  impersonation?: { por: string; sessaoId: string; actionLevel: 'read_only' | 'read_and_act' }
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

/** Lê e valida a sessão do aluno. Retorna null se ausente/inválida/expirada.
 *  Fallback: quando NÃO há sessão real de aluno mas há um cookie de VISUALIZAÇÃO (admin
 *  impersonando), devolve a sessão do aluno visualizado marcada com `impersonation`. */
export async function getSessaoAluno(): Promise<AlunoSession | null> {
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE)?.value
    if (token) {
      const { payload } = await jwtVerify(token, secret())
      if (payload.estudanteId && payload.tenantId) {
        return {
          estudanteId: String(payload.estudanteId),
          tenantId: String(payload.tenantId),
          nome: String(payload.nome ?? 'Aluno'),
          email: payload.email ? String(payload.email) : undefined,
        }
      }
    }
  } catch {
    // token inválido → tenta a visualização abaixo
  }
  // Sem sessão real → o admin pode estar visualizando (cookie separado). Nunca sobrepõe o aluno real.
  try {
    const imp = await lerSessaoImpersonation()
    if (imp) {
      return {
        estudanteId: imp.estudanteId,
        tenantId: imp.tenantId,
        nome: imp.nome,
        impersonation: { por: imp.impersonatedBy, sessaoId: imp.sessionId, actionLevel: imp.actionLevel },
      }
    }
  } catch {
    // ignora — sem visualização
  }
  return null
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
