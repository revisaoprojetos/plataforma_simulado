import { getCurrentAccess } from '@/lib/auth/permissions'
import { getCurrentTenantId } from '@/lib/tenant'
import { createAdminClient } from '@/lib/supabase/server'
import { getGamConfig } from '@/lib/gamificacao'
import { SemPermissao } from '@/components/ui/alert-box'
import { GamificacaoTabs } from './gamificacao-tabs'
import { Trophy } from 'lucide-react'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Gamificação' }

export default async function GamificacaoPage() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('gamificacao:view'))) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Gamificação</h1>
        <SemPermissao>Sem permissão para acessar a gamificação.</SemPermissao>
      </div>
    )
  }

  const tenantId = await getCurrentTenantId()
  const svc = createAdminClient()
  const config = await getGamConfig(svc, tenantId)
  const podeGerenciar = access.isAdmin || access.permissions.includes('gamificacao:manage')

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary"><Trophy className="h-5 w-5" /></span>
            <h1 className="text-2xl font-bold tracking-tight">Gamificação</h1>
          </div>
          <p className="text-sm text-muted-foreground">Configure XP, níveis, ligas, missões e conquistas do portal do aluno.</p>
        </div>
        <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${config?.ativo ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'}`}>
          {config?.ativo ? '● Ativa' : '○ Inativa'}
        </span>
      </div>

      {config && <GamificacaoTabs config={config} podeGerenciar={podeGerenciar} />}
    </div>
  )
}
