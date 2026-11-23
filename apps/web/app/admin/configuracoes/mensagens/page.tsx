import { getAllTenantMensagens, getTenantContato } from '@/lib/tenant-messages'
import { MensagensEditor } from '@/components/admin/mensagens-editor'
import { BarraSetorSlot } from '@/components/admin/barra-setor-slot'

export default async function MensagensPage() {
  const [mensagens, contato] = await Promise.all([
    getAllTenantMensagens(),
    getTenantContato(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Mensagens e contatos</h1>
        <p className="text-muted-foreground">
          Personalize os textos exibidos ao aluno e os canais de suporte da plataforma.
        </p>
      </div>

      <BarraSetorSlot />
      <MensagensEditor mensagens={mensagens} contato={contato} />
    </div>
  )
}
