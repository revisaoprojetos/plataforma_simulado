import { EstudioHeader } from '@/components/admin/estudio/estudio-header'
import { listarLixeira } from '@/app/admin/lixeira/actions'
import { LixeiraClient } from '@/components/admin/lixeira-client'

export const dynamic = 'force-dynamic'

// Lixeira do Estúdio de Conteúdo = REUSO EXATO da Lixeira do admin (mesma action + mesmo client),
// com dados reais. Itens excluídos (soft-delete) podem ser restaurados ou removidos em definitivo.
export default async function ConteudosLixeiraPage() {
  const itens = await listarLixeira()

  return (
    <div className="w-full space-y-6">
      <EstudioHeader titulo="Lixeira" />
      <p className="-mt-3 text-sm text-muted-foreground">Itens excluídos — restaure ou exclua definitivamente.</p>

      <LixeiraClient itens={itens} />
    </div>
  )
}
