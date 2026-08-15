import { redirect } from 'next/navigation'
import { sessaoResultadoPessoal } from '../../../builder-actions'
import { PersonalizadoResultado } from '@/components/aluno/personalizado-resultado'

export const dynamic = 'force-dynamic'

/** RESULTADO de um simulado personalizado (acesso pelo card, como nos oficiais): abre a melhor
 *  tentativa finalizada (ou a de `?st=`) na MESMA tela do simulado real. Sem tentativa → volta à HUD. */
export default async function ResultadoPersonalizadoPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ st?: string }>
}) {
  const { id } = await params
  const { st } = await searchParams
  const r = await sessaoResultadoPessoal(id, st)
  if (r.error || !r.sessaoId) redirect(`/aluno/simulados/personalizados/${id}/fazer`)
  return <PersonalizadoResultado sessaoId={r.sessaoId} simuladoId={id} />
}
