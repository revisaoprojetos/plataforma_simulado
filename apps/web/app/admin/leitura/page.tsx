import Link from 'next/link'
import { Library, ArrowLeft, Home, ChevronRight } from 'lucide-react'
import { listarBancoAulas } from './actions'
import { BancoAulasGrid, type ModuloTab } from '@/components/admin/banco-aulas-grid'
import { ModuloTabsBar } from '@/components/admin/modulo-tabs-bar'
import { ModuloBanner } from '@/components/admin/modulo-banner'
import { PublicarModuloBotao } from '@/components/admin/publicar-modulo-botao'
import { CopiarLinkModuloBotao } from '@/components/admin/copiar-link-modulo-botao'
import { LeituraRanking } from '@/components/aluno/leitura-ranking'
import { carregarRankingModulo } from '@/lib/leitura/ranking'
import { LeituraRelatorio } from '@/components/admin/leitura-relatorio'
import { carregarRelatorioModulo } from '@/lib/leitura/relatorio'
import { getCurrentTenant, getCurrentTenantId } from '@/lib/tenant'
import { resolverCardView } from '@/lib/card-view'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function LeituraAdminPage({ searchParams }: { searchParams: Promise<{ pasta?: string; tab?: string }> }) {
  const { pasta, tab } = await searchParams
  const moduloTab: ModuloTab = tab === 'acessos' || tab === 'config' || tab === 'ranking' || tab === 'relatorio' || tab === 'trilha' || tab === 'regulamento' ? tab : 'aulas'
  // Otimização: só as abas Aulas/Editar trilha (ou a raiz) precisam dos detalhes das aulas — Acessos/Config pulam esse fetch.
  const data = await listarBancoAulas(pasta ?? null, !pasta || moduloTab === 'aulas' || moduloTab === 'trilha')
  const temaCards = ((await getCurrentTenant())?.tema as any) ?? {}
  const cardView = resolverCardView(temaCards.card_view_admin ?? temaCards.card_view)

  // Banner do módulo (imagem larga) — usado como FUNDO do topo quando dentro de um módulo que o tenha.
  const banner = data.ok && pasta && data.moduloAtual?.capa_url ? data.moduloAtual.capa_url : null
  const breadcrumb = data.ok ? (data.breadcrumb ?? []) : []

  return (
    <div className={cn(banner ? 'relative space-y-2' : 'space-y-3', banner && '[overflow-anchor:none]')}>
      {banner ? (
        // Banner colapsável (ModuloBanner): imagem única + tabs na base; ao rolar, o topo sobe e sobra a
        // faixa com um cabeçalho COMPACTO (Voltar + título, sem descrição) + as tabs.
        <ModuloBanner
          banner={banner}
          degrade={data.ok && pasta ? data.moduloAtual?.trilhaAparencia.degrade : undefined}
          titulo="Desafio de Lei Seca"
          subtitulo="Módulos ordenáveis → aulas (documento HTML + questões) que formam a trilha do aluno."
          topoDireita={data.ok && pasta && data.moduloAtual ? <><CopiarLinkModuloBotao pastaId={pasta} claro /><PublicarModuloBotao pastaId={pasta} publicacao={data.moduloAtual.publicacao} /></> : null}
          breadcrumb={
            <>
              <Link href="/admin/leitura" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 transition-colors hover:bg-white/15 hover:text-white"><Home className="h-3.5 w-3.5" /> Módulos</Link>
              {breadcrumb.map((b) => (
                <span key={b.id} className="inline-flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5" />
                  <Link href={`/admin/leitura?pasta=${b.id}`} className="rounded-md px-1.5 py-0.5 font-medium text-white transition-colors hover:bg-white/15">{b.nome}</Link>
                </span>
              ))}
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
              <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Library className="h-6 w-6 text-primary" /> Desafio de Lei Seca</h1>
              <p className="text-muted-foreground">Módulos ordenáveis → aulas (documento HTML + questões) que formam a trilha do aluno.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            {data.ok && pasta && data.moduloAtual && (
              <>
                <CopiarLinkModuloBotao pastaId={pasta} />
                <PublicarModuloBotao pastaId={pasta} publicacao={data.moduloAtual.publicacao} />
              </>
            )}
          </div>
        </div>
      )}

      {!data.ok ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{data.error}</p>
      ) : (
        <>
          <BancoAulasGrid data={data} pastaAtual={pasta ?? null} cardView={cardView} moduloTab={moduloTab} semBreadcrumb={!!banner} semTabs={!!banner} />
          {/* Ranking do módulo (por acertos no quiz; pontos quando a gamificação estiver ativa). */}
          {moduloTab === 'ranking' && pasta && (
            <LeituraRanking ranking={await carregarRankingModulo(pasta, (await getCurrentTenantId()) ?? '')} modo="admin" moduloId={pasta} />
          )}
          {/* Relatório completo do módulo (adesão, sequências, pontuação, tempos + export Excel). */}
          {moduloTab === 'relatorio' && pasta && (
            <LeituraRelatorio rel={await carregarRelatorioModulo(pasta, (await getCurrentTenantId()) ?? '')} moduloId={pasta} />
          )}
        </>
      )}
    </div>
  )
}
