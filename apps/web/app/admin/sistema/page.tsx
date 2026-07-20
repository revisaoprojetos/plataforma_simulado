import { getCurrentAccess } from '@/lib/auth/permissions'
import { getManutencaoSistema } from '@/lib/sistema/manutencao'
import { SemPermissao } from '@/components/ui/alert-box'
import { ServerCog } from 'lucide-react'
import { SistemaTabs } from './sistema-tabs'

export const dynamic = 'force-dynamic'

export default async function SistemaPage() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || access.permissions.includes('configuracoes:view'))) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Sistema</h1>
        <SemPermissao>Sem permissão para acessar as configurações do sistema.</SemPermissao>
      </div>
    )
  }

  const manutencao = await getManutencaoSistema()

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <ServerCog className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Sistema</h1>
          <p className="text-muted-foreground">Manutenção da plataforma e funções essenciais de operação.</p>
        </div>
      </div>

      <SistemaTabs manutencao={manutencao} />
    </div>
  )
}
