import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarQuizAluno, gateQuizAluno } from '@/lib/leitura/acesso'
import { LEITURA_ATIVA } from '@/lib/flags'
import { LeituraQuestoesStep } from '@/components/aluno/leitura-questoes-step'

export const dynamic = 'force-dynamic'

/** Etapa 2 da aula: questões liberadas APÓS concluir a leitura. */
export default async function QuestoesLeituraPage({ params }: { params: Promise<{ id: string }> }) {
  if (!LEITURA_ATIVA) redirect('/aluno')
  const { id } = await params
  const sessao = await getSessaoAluno()
  if (!sessao) redirect('/aluno/entrar')
  // Gate LEVE (só este doc): publicado + visível + leitura concluída. NÃO varre a trilha inteira
  // (statusAulaAluno/sequenciaLeitura) nem carrega o documento — era o gargalo que travava a abertura.
  const g = await gateQuizAluno(id, sessao.estudanteId, sessao.tenantId)
  if (!g) redirect('/aluno/leitura')
  if (!g.leituraConcluida) redirect(`/aluno/leitura/${id}`) // precisa concluir a leitura antes
  const questoes = await carregarQuizAluno(id, sessao.estudanteId, sessao.tenantId)
  // "Voltar" leva à TRILHA do módulo (não à seleção de módulos).
  const trilhaHref = g.pastaId ? `/aluno/leitura?modulo=${g.pastaId}` : '/aluno/leitura'

  return <LeituraQuestoesStep doc={{ id, titulo: g.titulo }} questoes={questoes} trilhaHref={trilhaHref} />
}
