import { getCurrentAccess, accessCan } from '@/lib/auth/permissions'
import { SemPermissao } from '@/components/ui/alert-box'
import { RevisaoHead } from '@/components/admin/revisao/ui'
import { carregarAparencia } from '@/lib/admin/revisao/aparencia'
import { AparenciaForm } from './aparencia-form'

export const dynamic = 'force-dynamic'

export default async function AparenciaRevisaoPage() {
  const access = await getCurrentAccess()
  if (!(access.isAdmin || accessCan(access, 'configuracoes:view'))) return <SemPermissao>Você não tem permissão para ver as configurações.</SemPermissao>
  const dados = await carregarAparencia(access.tenantId ?? '00000000-0000-0000-0000-000000000000')
  return (
    <div>
      <RevisaoHead secao="Configurar" titulo="Aparência da plataforma"
        subtitulo="Logo, cores e o menu que o aluno vê. A identidade de cada curso (imagens e cores) fica em Montagem de curso › Imagens e cores." />
      <AparenciaForm inicial={dados} podeEditar={accessCan(access, 'configuracoes:manage')} />
    </div>
  )
}
