import { listarEtiquetas } from './actions'
import { EtiquetasClient } from './etiquetas-client'

export const dynamic = 'force-dynamic'

export default async function EtiquetasPage() {
  const r = await listarEtiquetas()
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Etiquetas</h1>
        <p className="text-muted-foreground">Rótulos para organizar e sinalizar questões (ex.: &quot;Questão desatualizada&quot;). Aplique-as no editor de cada questão.</p>
      </div>
      {r.ok ? (
        <EtiquetasClient inicial={r.itens ?? []} />
      ) : (
        <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{r.error}</p>
      )}
    </div>
  )
}
