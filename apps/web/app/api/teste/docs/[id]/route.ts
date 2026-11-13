import { NextResponse } from 'next/server'
import { docExiste, lerDoc } from '@/lib/teste/store'
import { exigirAcessoOO } from '@/lib/seguranca/guarda-onlyoffice'

// Serve o .docx cru — usado como `document.url` pelo OnlyOffice (o Document Server baixa daqui).
// Exige access_token (escopo ler) do docId na query, ou sessão super-admin.
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const negado = await exigirAcessoOO(req, { docId: id, escopo: 'ler' })
  if (negado) return negado
  if (!docExiste(id)) return new NextResponse('not found', { status: 404 })
  const buf = await lerDoc(id)
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'content-disposition': `inline; filename="${id}.docx"`,
      'cache-control': 'no-store',
    },
  })
}
