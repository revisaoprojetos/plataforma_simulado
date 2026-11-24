import { Skeleton } from '@/components/ui/skeleton'

/** Fallback leve (Suspense) dos blocos pesados de Cronogramas: o título e a nav já estão na tela; aqui só reserva o espaço. */
export function EsqueletoTela({ kpis = false, linhas = 6 }: { kpis?: boolean; linhas?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Carregando">
      {kpis && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[72px] rounded-2xl" />)}
        </div>
      )}
      <Skeleton className="h-9 w-full max-w-md rounded-[10px]" />
      <div className="space-y-2">
        {Array.from({ length: linhas }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
      </div>
    </div>
  )
}
