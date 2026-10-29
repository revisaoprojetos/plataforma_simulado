// Tela LEGADA (primeiro acesso do cronograma por EMISSÕES). O onboarding agora acontece no
// Cronograma Adaptativo (iframe) em /aluno/cronograma — esta rota apenas redireciona para lá.
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function CronogramaPrimeiroPage() {
  redirect('/aluno/cronograma')
}
