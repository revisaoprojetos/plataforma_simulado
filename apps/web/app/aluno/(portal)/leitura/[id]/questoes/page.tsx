import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { carregarQuizAluno } from '@/lib/leitura/acesso'
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
  // Perf: o quiz só precisa do TÍTULO (o `statusAulaAluno` já o traz) — NÃO carregamos o documento
  // inteiro (HTML da lei + anotações + grifos), que era o gargalo ao abrir a aula.
  const questoes = await carregarQuizAluno(id, sessao.estudanteId, sessao.tenantId)
  // "Voltar" leva à TRILHA do módulo (não à seleção de módulos). __geral__ não tem trilha própria.
  const trilhaHref = st.moduloId && st.moduloId !== '__geral__' ? `/aluno/leitura?modulo=${st.moduloId}` : '/aluno/leitura'

  return <LeituraQuestoesStep doc={{ id, titulo: st.titulo ?? 'Questões da aula' }} questoes={questoes} trilhaHref={trilhaHref} />
}
