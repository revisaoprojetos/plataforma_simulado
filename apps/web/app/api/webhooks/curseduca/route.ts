import { NextRequest, NextResponse } from 'next/server'
import { resolverCfg, executarImport } from '@/lib/curseduca/import-core'

export const dynamic = 'force-dynamic'

/**
 * WEBHOOK (tempo real) — PREPARADO PARA O FUTURO, desativado por padrão.
 *
 * Quando a Curseduca/n8n disparar um evento de "membro criado", ele faz um POST aqui e
 * importamos NA HORA (reutiliza `executarImport`, que já deduplica — só o novo entra).
 *
 * Ativação (quando quiser):
 *  1) Defina `CURSEDUCA_WEBHOOK_SECRET` no ambiente do web.
 *  2) No n8n/Curseduca, POST para /api/webhooks/curseduca com header `x-webhook-secret: <segredo>`
 *     e corpo JSON: { "tenantId": "<uuid>", "grupos": [<idGrupoCurseduca>], "destino"?: {...}, "sincronizar"?: false }
 *
 * Sem o segredo definido, responde 503 (inerte) — não há risco de uso indevido.
 */
export async function POST(req: NextRequest) {
  const segredo = process.env.CURSEDUCA_WEBHOOK_SECRET
  if (!segredo) return NextResponse.json({ ok: false, message: 'Webhook desativado (defina CURSEDUCA_WEBHOOK_SECRET).' }, { status: 503 })

  const enviado = req.headers.get('x-webhook-secret') ?? req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  if (enviado !== segredo) return NextResponse.json({ ok: false, message: 'Não autorizado.' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ ok: false, message: 'JSON inválido.' }, { status: 400 }) }

  const tenantId = String(body?.tenantId ?? '')
  const grupos = Array.isArray(body?.grupos) ? body.grupos.map(Number).filter((n: number) => Number.isFinite(n)) : []
  if (!tenantId || !grupos.length) return NextResponse.json({ ok: false, message: 'Informe tenantId e grupos[].' }, { status: 400 })

  const cfg = await resolverCfg(tenantId)
  if (!cfg) return NextResponse.json({ ok: false, message: 'Credenciais Curseduca não configuradas para o tenant.' }, { status: 400 })

  try {
    const resultado = await executarImport(
      { tenantId, cfg },
      grupos,
      body?.destino ?? { tipo: 'nenhum' },
      !!body?.sincronizar,
      Number.MAX_SAFE_INTEGER,
    )
    return NextResponse.json({ ok: true, resultado })
  } catch (e: any) {
    return NextResponse.json({ ok: false, message: e?.message ?? 'Falha na importação.' }, { status: 500 })
  }
}
