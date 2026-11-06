import { NextRequest, NextResponse } from 'next/server'
import { getSessaoAluno } from '@/lib/aluno-session'
import { urlDownloadAluno } from '@/lib/conteudo/leitor'
import { createAdminClient } from '@/lib/supabase/server'
import { liberacaoDoc } from '@/lib/cronograma/adaptativo/liberacao'

// Download do arquivo ORIGINAL de um documento da Biblioteca pelo ALUNO. Gate server-side (acesso por
// grupo/todos + herança + publicado); devolve redirect p/ a URL assinada temporária do storage.
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const sessao = await getSessaoAluno()
  if (!sessao) return NextResponse.json({ message: 'Não autenticado.' }, { status: 401 })
  const doc = new URL(request.url).searchParams.get('doc')
  if (!doc) return NextResponse.json({ message: 'doc ausente.' }, { status: 400 })
  // Cronograma Adaptativo: download só do material já liberado no plano do aluno (mensagem específica).
  const lib = await liberacaoDoc(createAdminClient(), sessao.tenantId, sessao.estudanteId, doc)
  if (lib.bloqueado) {
    const quando = lib.liberaEm ? ` Ele será liberado em ${lib.liberaEm.split('-').reverse().join('/')}.` : ''
    return NextResponse.json({ message: `Este material ainda não foi liberado no seu cronograma.${quando}` }, { status: 403 })
  }
  const url = await urlDownloadAluno(doc, sessao.estudanteId, { produtoId: new URL(request.url).searchParams.get('produto') })
  if (!url) return NextResponse.json({ message: 'Sem acesso a este documento.' }, { status: 403 })
  return NextResponse.redirect(url)
}
