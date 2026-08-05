import { NextResponse } from 'next/server'
import { limparSessaoAluno } from '@/lib/aluno-session'

// Endpoint dinamico (sessao/dados/mutacao) — nunca cachear estaticamente.
export const dynamic = 'force-dynamic'

export async function POST() {
  await limparSessaoAluno()
  return NextResponse.json({ ok: true })
}
