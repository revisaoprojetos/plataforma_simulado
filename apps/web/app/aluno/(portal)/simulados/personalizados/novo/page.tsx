import { redirect } from 'next/navigation'
import { getSessaoAluno } from '@/lib/aluno-session'
import { PersonalizadoWizard } from '@/components/aluno/personalizado-wizard'

export const dynamic = 'force-dynamic'

/** Criador de simulado personalizado (wizard): configuração → questões → prévia. */
export default async function NovoPersonalizadoPage() {
  const s = await getSessaoAluno()
  if (!s) redirect('/aluno/entrar')
  return <PersonalizadoWizard />
}
