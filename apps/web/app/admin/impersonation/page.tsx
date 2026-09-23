import { redirect } from 'next/navigation'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { ImpersonationConsole } from '@/components/admin/impersonation/impersonation-console'

export const dynamic = 'force-dynamic'

// Console de visualização de aluno. A sessão + a JANELA flutuante vivem no provider global
// (montado no layout do admin), por isso a janela persiste ao navegar por outras telas.
export default async function ImpersonationPage() {
  const access = await getCurrentAccess()
  if (!access.userId) redirect('/admin')
  const podeVer = access.isAdmin || accessCan(access, 'estudantes:view') || accessCan(access, 'auditoria:view')
  if (!podeVer) redirect('/admin')

  return <ImpersonationConsole />
}
