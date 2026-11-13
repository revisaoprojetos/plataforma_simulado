import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'
import { lerSessaoImpersonation } from '@/lib/impersonation/session'
import { alunoBloqueado } from '@/lib/aluno-bloqueio'
import { tocarAcesso, encerrarAcesso, revogadasEm, tokenRevogado } from '@/lib/acessos/registro'

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
  /** jti da sessão = id em simulado_aluno_acessos (registro de acessos). Ausente em tokens anteriores ao registro. */
  acessoId?: string
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
 *  PRIORIDADE: a VISUALIZAÇÃO (admin impersonando) vence a sessão real quando seu cookie está
 *  presente — o admin iniciou a visão deliberadamente e, no navegador dele, pode haver um resíduo
 *  de `aluno_session` de teste. Alunos reais nunca recebem o cookie de visualização (httpOnly, só
 *  criado pela ação do admin), então isso não afeta o aluno de verdade. */
export async function getSessaoAluno(): Promise<AlunoSession | null> {
  // 1) Visualização (impersonation) tem prioridade.
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
    // sem visualização → cai na sessão real
  }
  // 2) Sessão real do aluno.
  try {
    const jar = await cookies()
    const token = jar.get(COOKIE)?.value
    if (token) {
      const { payload } = await jwtVerify(token, secret())
      if (payload.estudanteId && payload.tenantId) {
        // CS › Membros: aluno bloqueado perde a sessão já aberta (o cookie dura 7 dias).
        if (await alunoBloqueado(String(payload.estudanteId))) return null
        // Admin encerrou todas as sessões do aluno: tokens emitidos antes disso deixam de valer.
        if (tokenRevogado(typeof payload.iat === 'number' ? payload.iat : undefined, await revogadasEm(String(payload.estudanteId)))) return null
        const acessoId = payload.acessoId ? String(payload.acessoId) : undefined
        // Heartbeat barato e throttled (≤ 1 escrita / 5 min / sessão), fora do caminho crítico.
        if (acessoId) tocarAcesso(acessoId, String(payload.tenantId), String(payload.estudanteId))
        return {
          acessoId,
          estudanteId: String(payload.estudanteId),
          tenantId: String(payload.tenantId),
          nome: String(payload.nome ?? 'Aluno'),
          email: payload.email ? String(payload.email) : undefined,
        }
      }
    }
  } catch {
    // token inválido
  }
  return null
}

export async function limparSessaoAluno(): Promise<void> {
  const emProducao = process.env.NODE_ENV === 'production'
  const jar = await cookies()
  // Registro de acessos: marca a sessão como encerrada (logout). Best-effort.
  try {
    const tk = jar.get(COOKIE)?.value
    if (tk) {
      const { payload } = await jwtVerify(tk, secret())
      if (payload.acessoId && payload.tenantId) encerrarAcesso(String(payload.acessoId), String(payload.tenantId), 'logout')
    }
  } catch { /* token inválido/sem registro */ }
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
