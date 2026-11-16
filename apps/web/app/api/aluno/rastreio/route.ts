import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSessaoAluno } from '@/lib/aluno-session'
import { rateLimit } from '@/lib/rate-limit'
import { registrarAtividade, tocarAcesso } from '@/lib/acessos/registro'
import { normalizarRota, tipoDerivadoDaRota, TIPOS_CLIENTE } from '@/lib/acessos/rota'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/aluno/rastreio — lote (≤ 20) de eventos de navegação do portal: pagina_vista / tempo_pagina.
 * Aceita text/plain (sendBeacon). Tipo só da whitelist; rota normalizada no servidor (sem query/tokens, ids → :id);
 * nenhum texto livre é aceito. Rate limit por aluno. Responde sem corpo (best-effort, nunca quebra a UI).
 */
const schema = z.object({
  eventos: z.array(z.object({
    t: z.enum(TIPOS_CLIENTE),
    r: z.string().max(300),
    d: z.number().int().min(0).max(14_400).optional(), // ≤ 4 h por evento
  }).strict()).min(1).max(20),
}).strict()

const vazio = (status = 204) => new NextResponse(null, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return vazio(401)
  const len = Number(req.headers.get('content-length') ?? 0)
  if (len > 8_000) return vazio(413)
  const rl = await rateLimit(`rastreio:${sessao.estudanteId}`, 60, 60_000)
  if (!rl.ok) return vazio(429)

  let corpo: unknown
  try { const txt = await req.text(); if (txt.length > 8_000) return vazio(413); corpo = JSON.parse(txt) } catch { return vazio(400) }
  const p = schema.safeParse(corpo)
  if (!p.success) return vazio(400)

  // Cada lote do beacon é sinal de vida da sessão: atualiza `ultimo_visto_em` (1 escrita extra por lote) → duração real da sessão.
  if (sessao.acessoId && !sessao.impersonation) tocarAcesso(sessao.acessoId, sessao.tenantId, sessao.estudanteId, 0)

  // Soma por lote ≤ 8 h: o excedente é descartado (evita inflar tempo por lote forjado).
  let acumulado = 0
  for (const e of p.data.eventos) {
    const rota = normalizarRota(e.r)
    if (!rota) continue
    const base = { refTipo: 'rota', refId: rota, rota }
    if (e.t === 'pagina_vista') {
      void registrarAtividade(sessao, { tipo: 'pagina_vista', ...base })
      const der = tipoDerivadoDaRota(rota)
      if (der) void registrarAtividade(sessao, { tipo: der, ...base })
    } else if (e.d != null && e.d >= 1) {
      if (acumulado + e.d > 28_800) continue
      acumulado += e.d
      void registrarAtividade(sessao, { tipo: 'tempo_pagina', ...base, duracaoSeg: e.d })
    }
  }
  return vazio()
}
