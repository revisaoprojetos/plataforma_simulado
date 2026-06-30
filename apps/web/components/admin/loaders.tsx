import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EstiloLoader = 'skeleton' | 'spinner' | 'dots' | 'bar'
export const ESTILOS_LOADER: { id: EstiloLoader; nome: string }[] = [
  { id: 'skeleton', nome: 'Esqueleto' },
  { id: 'spinner', nome: 'Spinner' },
  { id: 'dots', nome: 'Pontos' },
  { id: 'bar', nome: 'Barra' },
]

function Bar() {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
      <div className="loading-bar-fill h-full rounded-full bg-primary" />
    </div>
  )
}
function Spinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  )
}
function Dots() {
  return (
    <div className="flex items-center justify-center gap-2 py-16">
      {[0, 0.15, 0.3].map((d, i) => (
        <span key={i} className="h-3 w-3 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${d}s` }} />
      ))}
    </div>
  )
}
function SkeletonBlocks() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="skeleton-shimmer h-7 w-56 rounded-md bg-muted/70" />
        <div className="skeleton-shimmer h-4 w-80 rounded-md bg-muted/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton-shimmer h-28 rounded-xl bg-muted/70" />)}
      </div>
      <div className="space-y-2.5 rounded-xl border p-4">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton-shimmer h-10 w-full rounded-md bg-muted/70" />)}
      </div>
    </div>
  )
}

/** Renderiza o loader no estilo configurado. Sem hooks → server e client. */
export function Loader({ estilo = 'skeleton', className }: { estilo?: EstiloLoader; className?: string }) {
  return (
    <div className={cn('animate-page', className)}>
      {estilo === 'spinner' && <Spinner />}
      {estilo === 'dots' && <Dots />}
      {estilo === 'bar' && (
        <div className="space-y-3 py-2">
          <Bar />
          <SkeletonBlocks />
        </div>
      )}
      {(!estilo || estilo === 'skeleton') && <SkeletonBlocks />}
    </div>
  )
}
