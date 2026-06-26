import { NextResponse } from 'next/server'
import { limparSessaoAluno } from '@/lib/aluno-session'

export async function POST() {
  await limparSessaoAluno()
  return NextResponse.json({ ok: true })
}
