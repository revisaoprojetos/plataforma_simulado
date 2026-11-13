import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const schema = z.object({
  id: z.string().uuid(),
  status: z.enum(['resolvido', 'ignorado', 'aceito', 'aberto']),
  motivo: z.string().trim().max(1000).optional(),
})

/** POST /api/admin/seguranca/achado — resolver/ignorar/aceitar (ou reabrir) com motivo + audit. Exige seguranca:manage. */
export async function POST(req: NextRequest) {
  const access = await getCurrentAccess()
  if (!access.userId || !accessCan(access, 'seguranca:manage')) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  const parsed = schema.safeParse(await req.json().catch(() => null))
  if (!parsed.success) return NextResponse.json({ message: 'Dados inválidos.' }, { status: 400 })
  const { id, status, motivo } = parsed.data
  if (status !== 'aberto' && !motivo) return NextResponse.json({ message: 'Informe o motivo.' }, { status: 400 })

  const svc = createAdminClient()
  const { data: antes } = await svc.from('seguranca_achados').select('id, titulo, status, motivo_status').eq('id', id).maybeSingle()
  if (!antes) return NextResponse.json({ message: 'Achado não encontrado.' }, { status: 404 })
  const { error } = await svc.from('seguranca_achados').update({
    status, motivo_status: motivo ?? null, status_por: access.userId,
    resolvido_em: status === 'resolvido' ? new Date().toISOString() : null,
  }).eq('id', id)
  if (error) return NextResponse.json({ message: error.message }, { status: 500 })
  await registrarAudit({
    operacao: 'UPDATE', entidade: 'seguranca_achados', entidadeId: id,
    antes: { status: antes.status, motivo: antes.motivo_status }, depois: { status, motivo: motivo ?? null, titulo: antes.titulo },
  })
  return NextResponse.json({ ok: true })
}
