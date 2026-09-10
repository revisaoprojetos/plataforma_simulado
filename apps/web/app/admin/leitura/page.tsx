import { Library } from 'lucide-react'
import { listarBancoAulas } from './actions'
import { BancoAulasGrid } from '@/components/admin/banco-aulas-grid'
import { getCurrentTenant } from '@/lib/tenant'
import { resolverCardView } from '@/lib/card-view'

export const dynamic = 'force-dynamic'

export default async function LeituraAdminPage({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta } = await searchParams
  const data = await listarBancoAulas(pasta ?? null)
  const temaCards = ((await getCurrentTenant())?.tema as any) ?? {}
  const cardView = resolverCardView(temaCards.card_view_admin ?? temaCards.card_view)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> LegProc Digital</h1>
          <p className="text-muted-foreground">Módulos ordenáveis → aulas (documento HTML + questões) que formam a trilha do aluno.</p>
        </div>
        {data.ok && pasta && (
          <p className="max-w-xs text-right text-sm text-muted-foreground">{data.aulas?.length ?? 0} aula(s) neste módulo — a ordem define a sequência na trilha.</p>
        )}
      </div>

      {!data.ok ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{data.error}</p>
      ) : (
        <BancoAulasGrid data={data} pastaAtual={pasta ?? null} cardView={cardView} />
      )}
    </div>
  )
}
