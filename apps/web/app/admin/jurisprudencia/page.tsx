import Link from 'next/link'
import { Gamepad2, ArrowLeft } from 'lucide-react'
import { listarDesafios, lerDesafio } from '@/app/admin/jurisprudencia/actions'
import { ModuloAcesso } from '@/components/admin/modulo-acesso'
import { JurisDesafioLista } from '@/components/admin/jurisprudencia-lista'
import { JurisTabsBar, type JurisTab } from '@/components/admin/jurisprudencia-tabs'
import { JurisDiasEditor } from '@/components/admin/jurisprudencia-dias-editor'
import { JurisConfigForm } from '@/components/admin/jurisprudencia-config-form'
import { JurisRanking } from '@/components/admin/jurisprudencia-ranking'
import { JurisDesigner } from '@/components/admin/jurisprudencia-designer'
import { JurisMedalhas } from '@/components/admin/jurisprudencia-medalhas'
import { getCurrentTenant } from '@/lib/tenant'
import { resolverCardView } from '@/lib/card-view'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

// Admin do Desafio de Jurisprudência (JurisClub): cada desafio é uma PASTA (folder_area='jurisprudencia')
// cujo jogo vive em desafio_jogo jsonb. Sem desafio → lista; com desafio → abas de edição do jogo.
export default async function JurisprudenciaAdminPage({ searchParams }: { searchParams: Promise<{ desafio?: string; aba?: string }> }) {
  const { desafio, aba } = await searchParams

  // Sem desafio selecionado: lista de desafios + criar.
  if (!desafio) {
    const desafios = await listarDesafios()
    const temaCards = ((await getCurrentTenant())?.tema as any) ?? {}
    const cardView = resolverCardView(temaCards.card_view_admin ?? temaCards.card_view)
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Gamepad2 className="h-6 w-6 text-primary" /> Desafio de Jurisprudência</h1>
            <p className="text-muted-foreground">Jogo arcade de teses e súmulas — cada desafio tem 15 dias de perguntas.</p>
          </div>
        </div>
        <JurisDesafioLista desafios={desafios} cardView={cardView} />
      </div>
    )
  }

  // Com desafio: carrega o jogo e abre as abas de edição.
  const abaAtual: JurisTab = aba === 'config' || aba === 'designer' || aba === 'acessos' || aba === 'medalhas' || aba === 'ranking' ? aba : 'dias'
  const [res, lista] = await Promise.all([lerDesafio(desafio), listarDesafios()])

  if (!res.ok || !res.desafio) {
    return (
      <div className="space-y-4">
        <Link href="/admin/jurisprudencia" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Voltar aos desafios</Link>
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{res.error ?? 'Desafio não encontrado.'}</p>
      </div>
    )
  }

  const jogo = res.desafio
  const nome = lista.find((d) => d.id === desafio)?.nome ?? 'Desafio'

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <Link href="/admin/jurisprudencia" aria-label="Voltar aos desafios" title="Voltar aos desafios" className="mt-1 inline-flex shrink-0 items-center justify-center rounded-lg border bg-card p-2 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight"><Gamepad2 className="h-6 w-6 text-primary" /> {nome}</h1>
          <p className="text-muted-foreground">Edite os dias, as teses e as regras do jogo.</p>
        </div>
      </div>

      <JurisTabsBar desafioId={desafio} abaAtual={abaAtual} />

      <div className={cn('pt-1')}>
        {abaAtual === 'dias' && <JurisDiasEditor desafioId={desafio} dias={jogo.dias ?? {}} materias={jogo.materias ?? []} final={jogo.final ?? null} />}
        {abaAtual === 'config' && <JurisConfigForm desafioId={desafio} config={jogo.config ?? null} materias={jogo.materias ?? []} final={jogo.final ?? null} imagens={jogo.imagens ?? {}} />}
        {abaAtual === 'designer' && <JurisDesigner desafioId={desafio} aparencia={jogo.aparencia ?? {}} />}
        {abaAtual === 'acessos' && <ModuloAcesso pastaId={desafio} />}
        {abaAtual === 'medalhas' && <JurisMedalhas desafioId={desafio} materias={jogo.materias ?? []} final={jogo.final ?? null} imagens={jogo.imagens ?? {}} />}
        {abaAtual === 'ranking' && <JurisRanking desafioId={desafio} materias={jogo.materias ?? []} />}
      </div>
    </div>
  )
}
