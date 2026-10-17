import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { salvarDoc } from '@/lib/teste/store'
import { MODELOS } from '@/lib/teste/modelos'

// SPIKE — lista os modelos prontos (GET) e gera/abre um modelo escolhido (POST { modelo }).
export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ modelos: Object.entries(MODELOS).map(([key, m]) => ({ key, nome: m.nome, descricao: m.descricao })) })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const m = MODELOS[body?.modelo as string]
  if (!m) return NextResponse.json({ error: 'modelo inválido' }, { status: 400 })
  const buf = await m.gerar()
  const id = randomUUID()
  await salvarDoc(id, buf)
  return NextResponse.json({ id, nome: m.nome })
}
