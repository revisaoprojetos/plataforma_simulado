import { NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { createAdminClient } from '@/lib/supabase/server'

// GET /api/aluno/notificacoes — notificações do aluno logado (30 mais recentes) + contagem não lidas.
export async function GET() {
  const s = await getSessaoAluno()
  if (!s) return NextResponse.json({ items: [], naoLidas: 0 })
  const svc = createAdminClient()
  try {
    const { data } = await svc.from('simulado_notificacoes')
      .select('id, tipo, titulo, mensagem, link, lida, criado_em')
      .eq('estudante_id', s.estudanteId).eq('tenant_id', s.tenantId)
      .order('criado_em', { ascending: false }).limit(30)
    const items = (data ?? []) as any[]
    return NextResponse.json({ items, naoLidas: items.filter((i) => !i.lida).length })
  } catch {
    return NextResponse.json({ items: [], naoLidas: 0 }) // tabela ausente → vazio
  }
}

// POST /api/aluno/notificacoes — marca como lida (uma {id} ou todas).
export async function POST(req: Request) {
  const s = await getSessaoAluno()
  if (!s) return NextResponse.json({ ok: false })
  const svc = createAdminClient()
  try {
    const body = await req.json().catch(() => ({}))
    let q = svc.from('simulado_notificacoes').update({ lida: true }).eq('estudante_id', s.estudanteId).eq('tenant_id', s.tenantId)
    q = body?.id ? q.eq('id', String(body.id)) : q.eq('lida', false)
    await q
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
