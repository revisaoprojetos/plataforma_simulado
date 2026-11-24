import { listarLixeira } from './actions'
import { LixeiraClient } from '@/components/admin/lixeira-client'
import { CabecalhoArea } from '@/components/admin/cabecalho-area'

export const dynamic = 'force-dynamic'

export default async function LixeiraPage() {
  const itens = await listarLixeira()

  return (
    <div className="space-y-6">
      <CabecalhoArea titulo="Lixeira" descricao="Itens excluídos — restaure ou exclua definitivamente." />
      <LixeiraClient itens={itens} />
    </div>
  )
}
