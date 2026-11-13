import { NextRequest, NextResponse } from 'next/server'
import { ipDeRequest, limitar, lockoutFalha, lockoutLimpar, lockoutRestante, resposta429 } from '@/lib/rate-limit'
import { emailSeguro } from '@/lib/seguranca/postgrest-safe'

// POST /api/auth/login-guard — lockout/rate limit do login ADMIN (e-mail+senha). O signIn roda no navegador
// direto no Supabase Auth; este endpoint é chamado ANTES (fase 'antes'), e DEPOIS ('falha' | 'ok') para
// contar tentativas. Chave: IP+e-mail (não só IP: Curseduca/NAT compartilham IP) e e-mail isolado com
// teto maior. 5 falhas/15 min → trava 15 min; reincidência 1 h; depois 4 h. Fail-open se o limiter cair.
// OBS: é uma barreira do fluxo oficial de UI; o teto "duro" contra chamada direta ao GoTrue continua sendo
// o rate limit do próprio Supabase Auth.
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  let body: { email?: unknown; fase?: unknown } = {}
  try { body = await request.json() } catch { /* corpo vazio */ }
  const fase = body.fase === 'falha' || body.fase === 'ok' ? body.fase : 'antes'
  const email = emailSeguro(body.email)
  const ip = ipDeRequest(request.headers)
  // E-mail inválido nem chega ao Supabase com sucesso; só conta contra o IP.
  const chaveIpEmail = `adm:${ip}:${email ?? '-'}`
  const chaveEmail = email ? `adm:e:${email}` : null
  const chaveIp = `adm:ip:${ip}`

  if (fase === 'ok') {
    await Promise.all([lockoutLimpar(chaveIpEmail), chaveEmail ? lockoutLimpar(chaveEmail) : Promise.resolve()])
    return NextResponse.json({ ok: true })
  }

  const bloq = await limitar([[`login-guard:ip:${ip}`, 60, 60_000]])
  if (bloq) return bloq as NextResponse

  if (fase === 'falha') {
    const travas = await Promise.all([
      lockoutFalha(chaveIpEmail, 5),
      chaveEmail ? lockoutFalha(chaveEmail, 15) : Promise.resolve(0),
      lockoutFalha(chaveIp, 40),
    ])
    const s = Math.max(...travas)
    return s > 0 ? resposta429(s, 'Muitas tentativas de login. Aguarde para tentar novamente.', { bloqueado: true }) : NextResponse.json({ ok: true })
  }

  const restantes = await Promise.all([lockoutRestante(chaveIpEmail), chaveEmail ? lockoutRestante(chaveEmail) : Promise.resolve(0), lockoutRestante(chaveIp)])
  const s = Math.max(...restantes)
  return s > 0 ? resposta429(s, 'Muitas tentativas de login. Aguarde para tentar novamente.', { bloqueado: true }) : NextResponse.json({ ok: true })
}
