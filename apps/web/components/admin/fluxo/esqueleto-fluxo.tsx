/** Esqueleto do canvas (loading do dynamic e do loading.tsx). */
export function EsqueletoFluxo({ className }: { className?: string }) {
  return (
    <div className={className ?? 'flex w-full flex-col gap-3'} aria-busy="true" aria-label="Carregando o fluxo">
      <div className="h-8 w-2/3 animate-pulse rounded-md bg-muted" />
      <div className="h-[70dvh] min-h-[480px] w-full animate-pulse rounded-xl border bg-muted/40" />
    </div>
  )
}
