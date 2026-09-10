import Link from 'next/link'
import { Library, ArrowLeft } from 'lucide-react'
import { listarBancoAulas } from './actions'
import { BancoAulasGrid, type ModuloTab } from '@/components/admin/banco-aulas-grid'
import { PublicarModuloBotao } from '@/components/admin/publicar-modulo-botao'
import { getCurrentTenant } from '@/lib/tenant'
import { resolverCardView } from '@/lib/card-view'

export const dynamic = 'force-dynamic'

export default async function LeituraAdminPage({ searchParams }: { searchParams: Promise<{ pasta?: string; tab?: string }> }) {
  const { pasta, tab } = await searchParams
  const moduloTab: ModuloTab = tab === 'acessos' || tab === 'config' ? tab : 'aulas'
  // Otimização: só a aba Aulas (ou a raiz) precisa dos detalhes das aulas — Acessos/Config pulam esse fetch.
  const data = await listarBancoAulas(pasta ?? null, !pasta || moduloTab === 'aulas')
  const temaCards = ((await getCurrentTenant())?.tema as any) ?? {}
  const cardView = resolverCardView(temaCards.card_view_admin ?? temaCards.card_view)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          {pasta && (
            <Link href="/admin/leitura" aria-label="Voltar aos módulos" title="Voltar aos módulos" className="mt-1 inline-flex shrink-0 items-center justify-center rounded-lg border bg-card p-2 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          )}
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> LegProc Digital</h1>
            <p className="text-muted-foreground">Módulos ordenáveis → aulas (documento HTML + questões) que formam a trilha do aluno.</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {data.ok && pasta && moduloTab === 'aulas' && (
            <p className="max-w-xs text-right text-sm text-muted-foreground">{data.aulas?.length ?? 0} aula(s) neste módulo — a ordem define a sequência na trilha.</p>
          )}
          {data.ok && pasta && data.moduloAtual && (
            <PublicarModuloBotao pastaId={pasta} publicacao={data.moduloAtual.publicacao} />
          )}
        </div>
      </div>

      {!data.ok ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{data.error}</p>
      ) : (
        <BancoAulasGrid data={data} pastaAtual={pasta ?? null} cardView={cardView} moduloTab={moduloTab} />
      )}
    </div>
  )
}
