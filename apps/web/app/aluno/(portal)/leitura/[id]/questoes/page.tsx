import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarDocumentoAluno } from '@/lib/leitura/acesso'
import { statusAulaAluno } from '@/lib/leitura/trilha'
import { LEITURA_ATIVA } from '@/lib/flags'
import { LeituraQuestoesStep } from '@/components/aluno/leitura-questoes-step'

export const dynamic = 'force-dynamic'

/** Etapa 2 da aula: questões liberadas APÓS concluir a leitura (gate rígido + leitura concluída). */
export default async function QuestoesLeituraPage({ params }: { params: Promise<{ id: string }> }) {
  if (!LEITURA_ATIVA) redirect('/aluno')
  const { id } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  const st = await statusAulaAluno(sessao.estudanteId, sessao.tenantId, id)
  if (!st.visivel || st.estado === 'bloqueado') redirect('/aluno/leitura')
  if (!st.leituraConcluida) redirect(`/aluno/leitura/${id}`) // precisa concluir a leitura antes
  const doc = await carregarDocumentoAluno(id, sessao.estudanteId, sessao.tenantId)
  if (!doc) notFound()

  return <LeituraQuestoesStep doc={doc} />
}
