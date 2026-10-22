import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { urlDownloadAluno } from '@/lib/conteudo/leitor'

// Download do arquivo ORIGINAL de um documento da Biblioteca pelo ALUNO. Gate server-side (acesso por
// grupo/todos + herança + publicado); devolve redirect p/ a URL assinada temporária do storage.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  const doc = new URL(request.url).searchParams.get('doc')
  if (!doc) return NextResponse.json({ message: 'doc ausente.' }, { status: 400 })
  const url = await urlDownloadAluno(doc, sessao.estudanteId)
  if (!url) return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })
  return NextResponse.redirect(url)
}
