import { getAllTenantMensagens, getTenantContato } from '@/lib/tenant-messages'
import { MensagensEditor } from '@/components/admin/mensagens-editor'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

export default async function MensagensPage() {
  const [mensagens, contato] = await Promise.all([
    getAllTenantMensagens(),
    getTenantContato(),
  ])

  return (
    <div className="space-y-6">
      <CabecalhoArea
        titulo="Mensagens e contatos"
        descricao="Personalize os textos exibidos ao aluno e os canais de suporte da plataforma."
      />
      <MensagensEditor mensagens={mensagens} contato={contato} />
    </div>
  )
}
