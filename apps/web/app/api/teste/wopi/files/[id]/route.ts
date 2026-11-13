import { NextResponse } from 'next/server'
import { docExiste, lerDoc } from '@/lib/teste/store'
import { exigirAcessoOO } from '@/lib/seguranca/guarda-onlyoffice'
import { tokenDaRequest, validarTokenOO } from '@/lib/seguranca/token-onlyoffice'

// WOPI · CheckFileInfo — o Collabora chama isto pra saber metadados do arquivo e as permissões.
// Exige access_token (padrão WOPI, na query) válido para o docId.
export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const negado = await exigirAcessoOO(req, { docId: id, escopo: 'ler' })
  if (negado) return negado
  if (!docExiste(id)) return new NextResponse('not found', { status: 404 })
  const buf = await lerDoc(id)
  const podeEscrever = !!validarTokenOO(tokenDaRequest(req), { docId: id, escopo: 'escrever' })
  return NextResponse.json({
    BaseFileName: `${id}.docx`,
    Size: buf.length,
    OwnerId: 'admin',
    UserId: 'admin',
    UserFriendlyName: 'Admin (teste)',
    UserCanWrite: podeEscrever,
    SupportsUpdate: podeEscrever,
    SupportsLocks: false,
    PostMessageOrigin: '*',
    LastModifiedTime: new Date().toISOString(),
  })
}
