import { Trash2 } from 'lucide-react'
import { listarLixeira } from './actions'
import { LixeiraClient } from '@/components/admin/lixeira-client'

export const dynamic = 'force-dynamic'

export default async function LixeiraPage() {
  const itens = await listarLixeira()

  return (
    <div className="space-y-6">
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
