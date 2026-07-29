import { isSuperAdmin } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { CompartilharClient } from '@/components/admin/compartilhar-client'

export const dynamic = 'force-dynamic'

export default async function CompartilharPage() {
  if (!(await isSuperAdmin())) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Compartilhar</h1>
        <SemPermissao>Área exclusiva do super-administrador global.</SemPermissao>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Compartilhar entre plataformas</h1>
        <p className="text-muted-foreground">
          Copie bancos (com questões) e estudantes de uma plataforma para outra. A cópia é <span className="font-medium text-foreground">independente</span> —
          cada plataforma fica com a sua. Re-executar não duplica (dedup por procedência).
        </p>
      </div>
      <CompartilharClient />
    </div>
  )
}
