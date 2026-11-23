// Token `sat` (session access token) — capability HMAC curta, escopada a UMA sessão de prova.
// Emitido a quem acabou de provar a identidade (embed/login leve sem cookie) e apresentado nos downloads
// de PDF do aluno (diagnostico-docx-pdf / caderno-teste-pdf). Puro (sem server-only) p/ ser testável.
// Segredo: MESMA cadeia de lib/storage/pdf-acesso.ts (PDF_ACCESS_SECRET → ALUNO_SESSION_SECRET → …).
import { createHmac, timingSafeEqual } from 'node:crypto'

export const TTL_SAT_MS = 6 * 3600_000

export interface SatPayload { sid: string; tid: string; exp: number }

function segredo(): string {
  return process.env.PDF_ACCESS_SECRET || process.env.ALUNO_SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'dev-secret-troque-em-producao'
}
function assinar(payloadB64: string): string {
  return createHmac('sha256', segredo()).update(`sat:${payloadB64}`).digest('base64url')
}

export function assinarSat(sessaoId: string, tenantId: string, ttlMs: number = TTL_SAT_MS): string {
  const payload: SatPayload = { sid: sessaoId, tid: tenantId, exp: Date.now() + ttlMs }
  const b = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${b}.${assinar(b)}`
}

/** Verifica assinatura + expiração. Retorna o payload ou null. */
export function verificarSat(token: string | null | undefined): SatPayload | null {
  if (!token || typeof token !== 'string') return null
  const [b, sig, extra] = token.split('.')
  if (!b || !sig || extra !== undefined) return null
  const a = Buffer.from(sig), e = Buffer.from(assinar(b))
  if (a.length !== e.length || !timingSafeEqual(a, e)) return null
  try {
    const p = JSON.parse(Buffer.from(b, 'base64url').toString('utf8')) as SatPayload
    if (!p?.sid || !p?.tid || typeof p.exp !== 'number' || Date.now() > p.exp) return null
    return p
  } catch { return null }
}
