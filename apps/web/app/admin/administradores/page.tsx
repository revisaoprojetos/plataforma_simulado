import { redirect } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { SecaoHeader } from '@/components/admin/secao-header'
import { SemPermissao } from '@/components/ui/alert-box'
import { UserPlus, Users } from 'lucide-react'
import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { listarAdministradores } from './actions'
import { NovoAdministradorForm } from '@/components/admin/novo-administrador-form'
import { AdministradoresLista } from '@/components/admin/administradores-lista'

export const dynamic = 'force-dynamic'

export default async function AdministradoresPage() {
  const access = await getCurrentAccess()

  // Sem gestão de equipe, mas com leitura de permissões: manda para a aba Permissões.
  if (!accessCan(access, 'rbac:manage')) {
    redirect('/admin/administradores/permissoes')
  }

  const r = await listarAdministradores()
  const membros = r.membros ?? []
  const cargos = r.cargos ?? []

  return (
    <div className="space-y-6">
      {!r.ok && <SemPermissao>{r.error ?? 'Não foi possível carregar os administradores.'}</SemPermissao>}

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={UserPlus} titulo="Novo administrador" subtitulo="Cria (ou reaproveita) a conta por e-mail e concede acesso com o cargo escolhido." />
        <CardContent className="px-4 py-4">
          <NovoAdministradorForm cargos={cargos} />
        </CardContent>
      </Card>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>
        <SecaoHeader icon={Users} titulo="Equipe da plataforma" subtitulo={`${membros.length} administrador(es) com acesso`} />
        <CardContent className="px-4 py-4">
          <AdministradoresLista membros={membros} cargos={cargos} />
        </CardContent>
      </Card>
    </div>
  )
}
