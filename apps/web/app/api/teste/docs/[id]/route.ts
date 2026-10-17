import { NextResponse } from 'next/server'
import { docExiste, lerDoc } from '@/lib/teste/store'

// Serve o .docx cru — usado como `document.url` pelo OnlyOffice (o Document Server baixa daqui).
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
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
