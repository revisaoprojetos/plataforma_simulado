import { Suspense } from 'react'
import { LayoutTemplate, Loader2 } from 'lucide-react'
import { carregarModelosArea } from './actions'
import { ModelosGrid } from '@/components/admin/modelos-caderno/modelos-grid'

export default async function ModelosCadernoPage({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta } = await searchParams

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><LayoutTemplate className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Modelos de Caderno</h1>
          <p className="text-sm text-muted-foreground">Modelos e folhas de caderno editáveis, organizados em pastas — reutilizáveis nos cadernos dos simulados.</p>
        </div>
      </div>

      {/* Streaming: o cabeçalho aparece na hora e o grid entra quando os dados chegam (cache Redis por tenant). */}
      <Suspense fallback={<GridCarregando />}>
        <GridStream pasta={pasta ?? null} />
      </Suspense>
    </div>
  )
}

async function GridStream({ pasta }: { pasta: string | null }) {
  const { ok, modelos, pastas } = await carregarModelosArea()
  if (!ok) {
    return (
      <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
        Não foi possível carregar os modelos. Verifique se a migração <code>20260828000000_caderno_modelos</code> foi aplicada.
      </div>
    )
  }
  return <ModelosGrid modelos={modelos} pastas={pastas} pastaAtual={pasta} />
}

/** Fallback do Suspense: só aparece se o carregamento demorar (fade-in atrasado).
 *  Barra indeterminada no topo (linha correndo pro lado) + spinner + esqueleto dos cards. */
function GridCarregando() {
  return (
    <div className="loader-atrasado space-y-4">
      <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <div className="loading-bar-fill h-full rounded-full bg-primary" />
      </div>
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" /> Carregando modelos…
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl border bg-muted/40" />
        ))}
      </div>
    </div>
  )
}
