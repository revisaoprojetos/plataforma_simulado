import { NextResponse } from 'next/server'
import { docExiste, lerDoc, salvarDoc } from '@/lib/teste/store'
import { exigirAcessoOO } from '@/lib/seguranca/guarda-onlyoffice'

// WOPI · GetFile (GET, escopo ler) e PutFile (POST, escopo escrever) — access_token na query.
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const negado = await exigirAcessoOO(req, { docId: id, escopo: 'ler' })
  if (negado) return negado
  if (!docExiste(id)) return new NextResponse('not found', { status: 404 })
  const buf = await lerDoc(id)
  return new NextResponse(new Uint8Array(buf), {
    headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' },
  })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const negado = await exigirAcessoOO(request, { docId: id, escopo: 'escrever' })
  if (negado) return negado
  if (!docExiste(id)) return new NextResponse('not found', { status: 404 })
  const ab = await request.arrayBuffer()
  if (ab.byteLength < 100) return NextResponse.json({ status: 'erro' }, { status: 400 })
  await salvarDoc(id, Buffer.from(ab))
  return NextResponse.json({ status: 'ok' })
}
