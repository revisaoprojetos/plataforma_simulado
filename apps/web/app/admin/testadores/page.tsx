import { redirect } from 'next/navigation'

// A gestão de testadores virou o tab "Workspace" dentro de /admin/sistema (equipe interna:
// e-mail OU grupo, por cima da manutenção, fora de ranking). Esta rota antiga redireciona pra lá.
export const dynamic = 'force-dynamic'

export default function TestadoresPage() {
  redirect('/admin/sistema')
}
