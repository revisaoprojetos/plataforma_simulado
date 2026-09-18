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
  // Gate (aula bloqueada) e conteúdo são INDEPENDENTES → carrega em PARALELO (antes era em série, o gate
  // pesado atrasava a abertura). Se bloqueada, redireciona; o conteúdo carregado à toa é raro (só quando
  // bloqueada) e some no redirect.
  const [st, doc] = await Promise.all([
    statusAulaAluno(sessao.estudanteId, sessao.tenantId, id),
    carregarDocumentoAluno(id, sessao.estudanteId, sessao.tenantId),
  ])
  if (st.visivel && st.estado === 'bloqueado') redirect('/aluno/leitura')
  if (!doc) notFound()

  // "Voltar" leva à TRILHA do módulo (não à biblioteca/início do LegProc). Sem módulo → biblioteca.
  const voltarHref = st.moduloId && st.moduloId !== '__geral__' ? `/aluno/leitura?modulo=${st.moduloId}` : '/aluno/leitura'
  // Cores dos grifos definidas por DOCUMENTO (aba Configuração → quiz_config.grifoCores).
  return <LeitorDocumento doc={doc} buscaInicial={busca ?? undefined} grifoCores={doc.grifoCores} trilha={{ modo: 'leitura', questoesHref: `/aluno/leitura/${id}/questoes`, voltarHref }} />
}
