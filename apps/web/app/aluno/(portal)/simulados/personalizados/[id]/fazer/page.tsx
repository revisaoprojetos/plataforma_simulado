import { redirect } from 'next/navigation'
import { resumoSimuladoPessoal } from '../../../runner-actions'
import { PersonalizadoStart } from '@/components/aluno/personalizado-start'

export const dynamic = 'force-dynamic'

/** "Fazer" um simulado personalizado (Fase 2): mostra a TELA DE INÍCIO (HUD) com o resumo; a sessão
 *  só é aberta ao clicar em Iniciar (o timer do modo Prova começa aí). Sem questões/posse → volta. */
export default async function FazerPersonalizadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await resumoSimuladoPessoal(id)
  if (r.error || !r.resumo) redirect(`/aluno/simulados/personalizados/${id}`)
  return <PersonalizadoStart resumo={r.resumo} />
}
