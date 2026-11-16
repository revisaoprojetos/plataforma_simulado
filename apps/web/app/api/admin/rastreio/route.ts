import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { rateLimit } from '@/lib/rate-limit'
import { contextoReq } from '@/lib/acessos/registro'
import { processarLoteAdmin, novoRequestId, COOKIE_SID, ehUuid, type EventoAdmin } from '@/lib/admin-rastreio/registro'
import { normalizarRotaAdmin, TIPOS_CLIENTE_ADMIN } from '@/lib/admin-rastreio/rota'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/admin/rastreio — lote (≤ 20) de eventos de navegação do PAINEL: heartbeat / pagina_vista / tempo_pagina.
 * Aceita text/plain (sendBeacon). Autenticada: só EQUIPE (papel diferente de estudante, ou super-admin) é registrada;
 * aluno/anônimo → 401/403 sem gravar nada. Rota normalizada no servidor (sem query/tokens, ids → :id).
 * Resposta JSON mínima `{ encerrada }` (o cliente desloga se um admin encerrou a sessão).
 */
const schema = z.object({
  eventos: z.array(z.object({
    t: z.enum(TIPOS_CLIENTE_ADMIN),
    r: z.string().max(300).optional(),
    d: z.number().int().min(0).max(86_400).optional(),
  }).strict()).min(1).max(20),
}).strict()

const vazio = (status = 204) => new NextResponse(null, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !access.tenantId) return vazio(401)
  if (!access.isAdmin && (!access.role || access.role === 'estudante')) return vazio(403)
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > 8_000) return vazio(413)
  const rl = await rateLimit(`rastreio-adm:${access.userId}`, 60, 60_000)
  if (!rl.ok) return vazio(429)

  let corpo: unknown
  try { const txt = await req.text(); if (txt.length > 8_000) return vazio(413); corpo = JSON.parse(txt) } catch { return vazio(400) }
  const p = schema.safeParse(corpo)
  if (!p.success) return vazio(400)

  const eventos: EventoAdmin[] = []
  for (const e of p.data.eventos) {
    if (e.t === 'heartbeat') { eventos.push({ tipo: 'heartbeat' }); continue }
    const rota = normalizarRotaAdmin(e.r)
    if (!rota) continue
    if (e.t === 'tempo_pagina') { if (e.d != null && e.d >= 1) eventos.push({ tipo: 'tempo_pagina', rota, duracaoSeg: e.d }) }
    else eventos.push({ tipo: 'pagina_vista', rota })
  }
  if (!eventos.length) return vazio()

  const ctx = await contextoReq()
  const cookie = req.cookies.get(COOKIE_SID)?.value
  const r = await processarLoteAdmin({
    userId: access.userId, tenantId: access.tenantId, sidCookie: ehUuid(cookie) ? cookie : null,
    eventos, ip: ctx.ip, ua: ctx.ua, requestId: novoRequestId(req.headers),
  })
  const res = NextResponse.json({ encerrada: r.encerrada }, { headers: { 'Cache-Control': 'no-store' } })
  if (r.encerrada) res.cookies.delete(COOKIE_SID)
  else if (r.sid && (r.novaSessao || r.sid !== cookie)) {
    res.cookies.set(COOKIE_SID, r.sid, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 60 * 60 * 24 * 30 })
  }
  return res
}
