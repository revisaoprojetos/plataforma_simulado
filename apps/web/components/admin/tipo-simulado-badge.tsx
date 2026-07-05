import type { TipoSimulado } from '@/lib/simulado/tipo'

const CFG: Record<TipoSimulado, { label: string; cls: string }> = {
  objetiva: { label: 'Objetiva', cls: 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  discursiva: { label: 'Discursiva', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
  mista: { label: 'Mista', cls: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
}

/** Selo do tipo do simulado (Objetiva / Discursiva / Mista). Não renderiza nada se tipo nulo. */
export function TipoSimuladoBadge({ tipo, className = '' }: { tipo?: TipoSimulado | null; className?: string }) {
  if (!tipo) return null
  const c = CFG[tipo]
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${c.cls} ${className}`}>
      {c.label}
    </span>
  )
}
