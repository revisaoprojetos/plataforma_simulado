import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { salvarDoc } from '@/lib/teste/store'

// SPIKE — importar um .docx (upload) pra abrir no editor. Word é o formato nativo/fiel; .doc/.pdf não
// são aceitos aqui (PDF não é editável como Word; .doc precisaria de conversão).
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'arquivo ausente' }, { status: 400 })
  const nome = (file.name || '').toLowerCase()
  if (!nome.endsWith('.docx')) return NextResponse.json({ error: 'envie um .docx (Word). PDF/.doc não são suportados no editor.' }, { status: 415 })
  const buf = Buffer.from(await file.arrayBuffer())
  const id = randomUUID()
  await salvarDoc(id, buf)
  return NextResponse.json({ id })
}
