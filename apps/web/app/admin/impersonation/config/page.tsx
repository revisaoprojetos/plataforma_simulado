import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, SlidersHorizontal } from 'lucide-react'
import { getCurrentAccess } from '@/lib/auth/permissions'
import { carregarConfigImpersonacao } from '../actions'
import { ImpersonationConfig } from '@/components/admin/impersonation/impersonation-config'

export const dynamic = 'force-dynamic'

// Config (B): quais papéis podem visualizar + modo de notificação. Só administradores.
export default async function ImpersonationConfigPage() {
  const access = await getCurrentAccess()
  if (!access.userId) redirect('/admin')
  if (!access.isAdmin) redirect('/admin/impersonation')

  const cfg = await carregarConfigImpersonacao()

  return (
    <div className="animate-page space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/admin/impersonation" className="flex h-9 w-9 items-center justify-center rounded-lg border transition-colors hover:bg-muted"><ArrowLeft className="h-4 w-4" /></Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><SlidersHorizontal className="h-6 w-6 text-primary" /> Configuração — Visualização de aluno</h1>
          <p className="text-muted-foreground">Defina quais papéis podem visualizar contas de aluno e como o aluno é notificado.</p>
        </div>
      </div>

      {cfg.ok && cfg.roles && cfg.modo ? (
        <ImpersonationConfig roles={cfg.roles} modo={cfg.modo} />
      ) : (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{cfg.error ?? 'Não foi possível carregar a configuração.'}</div>
      )}
    </div>
  )
}
