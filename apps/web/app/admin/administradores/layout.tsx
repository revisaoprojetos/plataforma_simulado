import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { AdministradoresTabs } from '@/components/admin/administradores-tabs'
import { SemPermissao } from '@/components/ui/alert-box'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

export const dynamic = 'force-dynamic'

export default async function AdministradoresLayout({ children }: { children: React.ReactNode }) {
  const access = await getCurrentAccess()
  const podeGerir = accessCan(access, 'rbac:manage')
  const podeVer = podeGerir || accessCan(access, 'rbac:view')

  if (!podeVer) {
    return (
      <div className="space-y-4">
        <CabecalhoArea titulo="Administradores" semBarraSetor />
        <SemPermissao>Você não tem permissão para acessar esta área.</SemPermissao>
      </div>
    )
  }

  return (
    <div className="animate-page space-y-6">
      <CabecalhoArea
        titulo="Administradores"
        descricao={<>Equipe da plataforma e cargos com suas liberações. Cada cargo é configurado na aba <b>Permissões</b>.</>}
      />
      <AdministradoresTabs podeGerir={podeGerir} />
      {children}
    </div>
  )
}
