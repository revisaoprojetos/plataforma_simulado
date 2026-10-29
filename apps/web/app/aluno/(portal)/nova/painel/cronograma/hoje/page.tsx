import { redirect } from 'next/navigation'

// "Cronograma hoje" foi unificado no Cronograma Adaptativo (/aluno/cronograma), que já abre no dia
// de hoje do plano fixado. Rota legada só redireciona.
export default function CronogramaHojeLegadoPage() {
  redirect('/aluno/cronograma')
}
