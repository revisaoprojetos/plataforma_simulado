import { notFound, redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarDocumentoAluno } from '@/lib/leitura/acesso'
import { statusAulaAluno } from '@/lib/leitura/trilha'
import { LEITURA_ATIVA } from '@/lib/flags'
import { LeitorDocumento } from '@/components/aluno/leitor-documento'

export const dynamic = 'force-dynamic'

export default async function LeitorPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ busca?: string }> }) {
  if (!LEITURA_ATIVA) redirect('/aluno')
  const { id } = await params
  const { busca } = await searchParams
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  // Gate rígido: aula bloqueada (anterior não concluída) → volta à trilha.
  const st = await statusAulaAluno(sessao.estudanteId, sessao.tenantId, id)
  if (st.visivel && st.estado === 'bloqueado') redirect('/aluno/leitura')
  const doc = await carregarDocumentoAluno(id, sessao.estudanteId, sessao.tenantId)
  if (!doc) notFound()

  return <LeitorDocumento doc={doc} buscaInicial={busca ?? undefined} trilha={{ modo: 'leitura', questoesHref: `/aluno/leitura/${id}/questoes`, voltarHref: '/aluno/leitura' }} />
}
