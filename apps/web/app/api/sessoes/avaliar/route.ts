import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/sessoes/avaliar — NPS/satisfação a partir de uma SESSÃO finalizada.
 * Autentica pelo `sessao_id` (mesmo modelo dos demais endpoints da prova embed): a própria
 * sessão prova quem é e o que fez. Funciona tanto no portal quanto no widget embed. Idempotente
 * (upsert por estudante+simulado) e tolerante se a tabela ainda não foi migrada.
 */
export async function POST(req: NextRequest) {
  let body: { sessao_id?: string; nps?: number; comentario?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 }) }

  const nps = Math.round(Number(body.nps))
  if (!body.sessao_id) return NextResponse.json({ error: 'Sessão ausente.' }, { status: 400 })
  if (!Number.isFinite(nps) || nps < 0 || nps > 10) return NextResponse.json({ error: 'Nota deve ser de 0 a 10.' }, { status: 400 })

  const svc = await createServiceClient()
  const { data: sess } = await svc
    .from('simulado_sessoes_prova')
    .select('id, tenant_id, estudante_id, simulado_id, status, is_teste')
    .eq('id', body.sessao_id)
    .maybeSingle()
  if (!sess) return NextResponse.json({ error: 'Sessão não encontrada.' }, { status: 404 })
  if ((sess as any).is_teste) return NextResponse.json({ ok: true, ignorado: true }) // testador não avalia
  if ((sess as any).status !== 'finalizada') return NextResponse.json({ error: 'Conclua o simulado antes de avaliar.' }, { status: 400 })

  const { error } = await svc.from('simulado_avaliacoes').upsert(
    {
      tenant_id: (sess as any).tenant_id,
      estudante_id: (sess as any).estudante_id,
      simulado_id: (sess as any).simulado_id,
      sessao_id: (sess as any).id,
      nps,
      comentario: (body.comentario ?? '').trim().slice(0, 1000) || null,
      atualizado_em: new Date().toISOString(),
    },
    { onConflict: 'estudante_id,simulado_id' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
