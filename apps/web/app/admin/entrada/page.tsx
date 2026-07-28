import { isSuperAdmin } from '@/lib/auth/permissions'
import { getConfigGlobal } from '@/lib/config-global'
import { SemPermissao } from '@/components/ui/alert-box'
import { EntradaForm } from '@/components/admin/entrada-form'
import { Card, CardContent } from '@/components/ui/card'
import { SecaoHeader } from '@/components/admin/secao-header'
import { LogIn } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function EntradaPage() {
  if (!(await isSuperAdmin())) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Entrada</h1>
        <SemPermissao>Área exclusiva do super-administrador global.</SemPermissao>
      </div>
    )
  }

  const cfg = await getConfigGlobal()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Entrada neutra</h1>
        <p className="text-muted-foreground">
          Aparência e comportamento da tela de login — igual para todas as plataformas, sem preferência por nenhuma.
          Os logos de cada plataforma continuam aparecendo nos cards de seleção.
        </p>
      </div>

      <Card className="overflow-hidden" style={{ ['--card-spacing' as never]: '0px' }}>
        <SecaoHeader icon={LogIn} titulo="Tela de login" subtitulo="Layout, seletor de plataforma e marca neutra." />
        <CardContent className="px-4 py-4">
          <EntradaForm cfg={cfg} />
        </CardContent>
      </Card>
    </div>
  )
}
