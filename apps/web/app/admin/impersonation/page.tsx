import { redirect } from 'next/navigation'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { getImpersonationPermission } from '@/lib/impersonation/permissions'
import { listarLogsImpersonation } from '@/lib/impersonation/logs'
import { createAdminClient } from '@/lib/supabase/server'
import { ImpersonationConsole } from '@/components/admin/impersonation/impersonation-console'

export const dynamic = 'force-dynamic'

// Console de visualização de aluno: escolher aluno → abrir (encaixado / janela flutuante),
// operando como o aluno. Aba de Logs (auditoria) junto. Config em /admin/impersonation/config.
export default async function ImpersonationPage() {
  const access = await getCurrentAccess()
  if (!access.userId) redirect('/admin')
  const podeVer = access.isAdmin || accessCan(access, 'estudantes:view') || accessCan(access, 'auditoria:view')
  if (!podeVer) redirect('/admin')

  const perm = await getImpersonationPermission(access)
  const svc = createAdminClient()
  const [{ data: alunos }, logs] = await Promise.all([
    access.tenantId
      ? svc.from('simulado_estudantes').select('id, nome, email').eq('tenant_id', access.tenantId).order('nome').limit(40)
      : Promise.resolve({ data: [] as any[] }),
    access.tenantId ? listarLogsImpersonation(access.tenantId) : Promise.resolve([]),
  ])

  return (
    <ImpersonationConsole
      podeAbrir={!!perm}
      isAdmin={access.isAdmin}
      alunosIniciais={(alunos ?? []) as { id: string; nome: string; email: string | null }[]}
      logs={logs}
    />
  )
}
