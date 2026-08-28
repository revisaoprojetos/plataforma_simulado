import { LayoutTemplate } from 'lucide-react'
import { carregarModelosArea } from './actions'
import { ModelosGrid } from '@/components/admin/modelos-caderno/modelos-grid'

export default async function ModelosCadernoPage({ searchParams }: { searchParams: Promise<{ pasta?: string }> }) {
  const { pasta } = await searchParams
  const { ok, modelos, pastas } = await carregarModelosArea()

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><LayoutTemplate className="h-5 w-5" /></span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Modelos de Caderno</h1>
          <p className="text-sm text-muted-foreground">Modelos e folhas de caderno editáveis, organizados em pastas — reutilizáveis nos cadernos dos simulados.</p>
        </div>
      </div>

      {ok ? (
        <ModelosGrid modelos={modelos} pastas={pastas} pastaAtual={pasta ?? null} />
      ) : (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-sm text-destructive">
          Não foi possível carregar os modelos. Verifique se a migração <code>20260828000000_caderno_modelos</code> foi aplicada.
        </div>
      )}
    </div>
  )
}
