import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { AdministradoresTabs } from '@/components/admin/administradores-tabs'
import { SemPermissao } from '@/components/ui/alert-box'

export const dynamic = 'force-dynamic'

export default async function AdministradoresLayout({ children }: { children: React.ReactNode }) {
  const access = await getCurrentAccess()
  const podeGerir = accessCan(access, 'rbac:manage')
  const podeVer = podeGerir || accessCan(access, 'rbac:view')

  if (!podeVer) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Administradores</h1>
        <SemPermissao>Você não tem permissão para acessar esta área.</SemPermissao>
      </div>
    )
  }

  return (
    <div className="animate-page space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Administradores</h1>
        <p className="text-muted-foreground">Equipe da plataforma e cargos com suas liberações. Cada cargo é configurado na aba <b>Permissões</b>.</p>
      </div>
      <AdministradoresTabs podeGerir={podeGerir} />
      {children}
    </div>
  )
}
