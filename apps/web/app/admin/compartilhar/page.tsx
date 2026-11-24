import { isSuperAdmin } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { CompartilharClient } from '@/components/admin/compartilhar-client'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

export const dynamic = 'force-dynamic'

export default async function CompartilharPage() {
  if (!(await isSuperAdmin())) {
    return (
      <div className="space-y-4">
        <CabecalhoArea titulo="Compartilhar" />
        <SemPermissao>Área exclusiva do super-administrador global.</SemPermissao>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <CabecalhoArea
        titulo="Compartilhar entre plataformas"
        descricao={<>Copie bancos (com questões) e estudantes de uma plataforma para outra. A cópia é <span className="font-medium text-foreground">independente</span> — cada plataforma fica com a sua. Re-executar não duplica (dedup por procedência).</>}
      />
      <CompartilharClient />
    </div>
  )
}
