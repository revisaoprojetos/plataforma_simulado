import { NextResponse } from 'next/server'
import { registrarAudit } from '@/lib/audit'

/** Registra auditoria de LOGIN. Chamado pelo form client-side após signIn. */
export async function POST() {
  await registrarAudit({ operacao: 'LOGIN', entidade: 'auth', atorTipo: 'usuario', depois: {} })
  return NextResponse.json({ ok: true })
}
