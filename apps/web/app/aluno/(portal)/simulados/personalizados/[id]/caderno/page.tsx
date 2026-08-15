import { redirect } from 'next/navigation'
import { cadernoSimuladoPessoal } from '../../../runner-actions'
import { CadernoImprimivel } from '@/components/aluno/caderno-imprimivel'

export const dynamic = 'force-dynamic'

/** Caderno de questões imprimível (sem gabarito) do simulado pessoal — "Baixar" via impressão do
 *  navegador (salvar como PDF). Valida posse; sem questões → volta ao editor. */
export default async function CadernoPersonalizadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await cadernoSimuladoPessoal(id)
  if (r.error || !r.questoes?.length) redirect(`/aluno/simulados/personalizados/${id}`)
  return <CadernoImprimivel titulo={r.titulo ?? 'Simulado'} questoes={r.questoes} />
}
