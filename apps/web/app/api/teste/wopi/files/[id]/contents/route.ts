import { NextResponse } from 'next/server'
import { docExiste, lerDoc, salvarDoc } from '@/lib/teste/store'

// WOPI · GetFile (GET) e PutFile (POST) — o Collabora baixa o .docx e salva de volta por aqui.
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!docExiste(id)) return new NextResponse('not found', { status: 404 })
  const buf = await lerDoc(id)
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ab = await request.arrayBuffer()
  await salvarDoc(id, Buffer.from(ab))
  return NextResponse.json({ status: 'ok' })
}
