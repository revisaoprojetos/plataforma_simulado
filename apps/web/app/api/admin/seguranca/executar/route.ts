import { NextResponse } from 'next/server'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { registrarAudit } from '@/lib/audit'
import { executarVarreduraRuntime } from '@/lib/seguranca/scanner'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/** POST /api/admin/seguranca/executar — "Executar varredura agora" (exige seguranca:manage). */
export async function POST() {
  const access = await getCurrentAccess()
  if (!access.userId || !accessCan(access, 'seguranca:manage')) return NextResponse.json({ message: 'Sem permissão.' }, { status: 403 })
  try {
    const r = await executarVarreduraRuntime('manual')
    await registrarAudit({
      operacao: 'INSERT', entidade: 'seguranca_varreduras', entidadeId: r.varreduraId,
      depois: { origem: 'manual', total: r.total, criticos: r.criticos, altos: r.altos, novos: r.novos, resolvidos: r.resolvidos },
    })
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    return NextResponse.json({ message: String(e?.message ?? e) }, { status: 500 })
  }
}
