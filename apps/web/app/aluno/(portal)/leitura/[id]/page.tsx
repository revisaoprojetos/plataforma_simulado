import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarDocumentoAluno } from '@/lib/leitura/acesso'
import { LEITURA_ATIVA } from '@/lib/flags'
import { LeitorDocumento } from '@/components/aluno/leitor-documento'

export const dynamic = 'force-dynamic'

export default async function LeitorPage({ params }: { params: Promise<{ id: string }> }) {
  if (!LEITURA_ATIVA) redirect('/aluno')
  const { id } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const doc = await carregarDocumentoAluno(id, sessao.estudanteId, sessao.tenantId)
  if (!doc) notFound()

  return <LeitorDocumento doc={doc} />
}
