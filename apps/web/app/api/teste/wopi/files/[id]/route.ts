import { NextResponse } from 'next/server'
import { docExiste, lerDoc } from '@/lib/teste/store'

// WOPI · CheckFileInfo — o Collabora chama isto pra saber metadados do arquivo e as permissões.
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!docExiste(id)) return new NextResponse('not found', { status: 404 })
  const buf = await lerDoc(id)
  return NextResponse.json({
    BaseFileName: `${id}.docx`,
    Size: buf.length,
    OwnerId: 'admin',
    UserId: 'admin',
    UserFriendlyName: 'Admin (teste)',
    UserCanWrite: true,
    SupportsUpdate: true,
    SupportsLocks: false,
    PostMessageOrigin: '*',
    LastModifiedTime: new Date().toISOString(),
  })
}
