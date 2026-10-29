// Tela LEGADA (montar/recalcular cronograma por EMISSÕES). Montar/recalcular agora acontece no
// Cronograma Adaptativo (iframe) em /aluno/cronograma — esta rota apenas redireciona para lá.
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function CronogramaMontarPage() {
  redirect('/aluno/cronograma')
}
