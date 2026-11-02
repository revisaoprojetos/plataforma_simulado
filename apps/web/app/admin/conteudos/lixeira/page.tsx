import { Trash2 } from 'lucide-react'
import { listarLixeira } from '@/app/admin/lixeira/actions'
import { LixeiraClient } from '@/components/admin/lixeira-client'

export const dynamic = 'force-dynamic'

// Lixeira do Estúdio de Conteúdo = REUSO EXATO da Lixeira do admin (mesma action + mesmo client),
// com dados reais. Itens excluídos (soft-delete) podem ser restaurados ou removidos em definitivo.
export default async function ConteudosLixeiraPage() {
  const itens = await listarLixeira()

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Trash2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lixeira</h1>
          <p className="text-muted-foreground">Itens excluídos — restaure ou exclua definitivamente.</p>
        </div>
      </div>

      <LixeiraClient itens={itens} />
    </div>
  )
}
