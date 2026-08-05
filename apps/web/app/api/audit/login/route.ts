import { NextResponse } from 'next/server'
import { registrarAudit } from '@/lib/audit'

/** Registra auditoria de LOGIN. Chamado pelo form client-side após signIn. */
// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

export async function POST() {
  await registrarAudit({ operacao: 'LOGIN', entidade: 'auth', atorTipo: 'usuario', depois: {} })
  return NextResponse.json({ ok: true })
}
