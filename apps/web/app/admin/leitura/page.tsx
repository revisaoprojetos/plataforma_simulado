import Link from 'next/link'
import { Library, ArrowLeft, Home, ChevronRight } from 'lucide-react'
import { listarBancoAulas } from './actions'
import { BancoAulasGrid, type ModuloTab } from '@/components/admin/banco-aulas-grid'
import { ModuloTabsBar } from '@/components/admin/modulo-tabs-bar'
import { ModuloBanner } from '@/components/admin/modulo-banner'
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

  // Banner do módulo (imagem larga) — usado como FUNDO do topo quando dentro de um módulo que o tenha.
  const banner = data.ok && pasta && data.moduloAtual?.capa_url ? data.moduloAtual.capa_url : null
  const breadcrumb = data.ok ? (data.breadcrumb ?? []) : []

  return (
    <div className={banner ? 'space-y-2' : 'space-y-3'}>
      {banner ? (
        // ===== TOPO com o BANNER do módulo — sticky + colapsável no scroll (ModuloBanner). =====
        <ModuloBanner
          banner={banner}
          topo={
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Link href="/admin/leitura" aria-label="Voltar aos módulos" title="Voltar aos módulos" className="mt-1 inline-flex shrink-0 items-center justify-center rounded-lg border border-white/25 bg-white/15 p-2 text-white shadow-sm backdrop-blur transition-colors hover:bg-white/25">
                    <ArrowLeft className="h-4 w-4" />
                  </Link>
                  <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight drop-shadow"><Library className="h-6 w-6" /> LegProc Digital</h1>
                    <p className="text-white/80 drop-shadow-sm">Módulos ordenáveis → aulas (documento HTML + questões) que formam a trilha do aluno.</p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  {data.ok && pasta && data.moduloAtual && (
                    <PublicarModuloBotao pastaId={pasta} publicacao={data.moduloAtual.publicacao} />
                  )}
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1 text-sm text-white/75">
                <Link href="/admin/leitura" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-white/15 hover:text-white"><Home className="h-3.5 w-3.5" /> Módulos</Link>
                {breadcrumb.map((b) => (
                  <span key={b.id} className="inline-flex items-center gap-1">
                    <ChevronRight className="h-3.5 w-3.5" />
                    <Link href={`/admin/leitura?pasta=${b.id}`} className="rounded-md px-1.5 py-0.5 font-medium text-white transition-colors hover:bg-white/15">{b.nome}</Link>
                  </span>
                ))}
              </div>
            </>
          }
          tabs={<ModuloTabsBar pastaAtual={pasta!} moduloTab={moduloTab} claro />}
        />
      ) : (
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
            {data.ok && pasta && data.moduloAtual && (
              <PublicarModuloBotao pastaId={pasta} publicacao={data.moduloAtual.publicacao} />
            )}
          </div>
        </div>
      )}

      {!data.ok ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{data.error}</p>
      ) : (
        <BancoAulasGrid data={data} pastaAtual={pasta ?? null} cardView={cardView} moduloTab={moduloTab} semBreadcrumb={!!banner} semTabs={!!banner} />
      )}
    </div>
  )
}
