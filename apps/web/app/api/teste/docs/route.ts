import { NextResponse } from 'next/server'
import { criarDoc, listarDocs } from '@/lib/teste/store'

// SPIKE (área Teste do admin): cria/lista .docx pro teste dos editores Office. Sem auth pesada — é local.
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const id = await criarDoc(typeof body?.titulo === 'string' && body.titulo.trim() ? body.titulo.trim() : 'Documento de teste')
  return NextResponse.json({ id })
}

export async function GET() {
  return NextResponse.json({ docs: await listarDocs() })
}
