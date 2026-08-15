import { redirect } from 'next/navigation'
import { abrirSessaoPessoal } from '../../../runner-actions'
import { PersonalizadoRunner } from '@/components/aluno/personalizado-runner'

export const dynamic = 'force-dynamic'

/** "Fazer" um simulado personalizado do aluno (Fase 2). A action valida a posse e abre/retoma a
 *  sessão; sem questões (ou não sendo do aluno), volta ao editor/lista. */
export default async function FazerPersonalizadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await abrirSessaoPessoal(id)
  if (r.error || !r.sessao) redirect(`/aluno/simulados/personalizados/${id}`)
  return <PersonalizadoRunner sessao={r.sessao} />
}
