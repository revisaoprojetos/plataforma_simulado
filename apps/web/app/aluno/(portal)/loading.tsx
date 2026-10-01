/** Skeleton instantâneo do portal do aluno (Suspense do segmento) — evita a tela presa/branca ao
 *  navegar entre páginas do aluno e ao carregar /aluno dentro da "Visualização de aluno". */
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl animate-pulse space-y-4" aria-hidden>
      <div className="h-8 w-56 rounded-lg bg-muted" />
      <div className="h-4 w-80 max-w-full rounded bg-muted" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl border bg-card">
            <div className="h-full w-full rounded-2xl bg-muted/60" />
          </div>
        ))}
      </div>
    </div>
  )
}
