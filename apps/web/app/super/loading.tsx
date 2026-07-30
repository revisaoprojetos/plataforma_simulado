/** Tela de carregamento do console (super-admin) — skeleton enquanto os dados chegam. */
export default function ConsoleLoading() {
  return (
    <div className="animate-pulse space-y-6">
      {/* Cabeçalho */}
      <div className="space-y-2">
        <div className="h-7 w-56 rounded-lg bg-muted" />
        <div className="h-4 w-80 rounded bg-muted/70" />
      </div>

      {/* KPIs / cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border bg-card p-4 shadow-sm">
            <div className="h-10 w-10 rounded-xl bg-muted" />
            <div className="mt-3 h-4 w-24 rounded bg-muted/70" />
          </div>
        ))}
      </div>

      {/* Bloco de conteúdo */}
      <div className="space-y-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="h-5 w-40 rounded bg-muted" />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-10 rounded-lg bg-muted/60" />
        ))}
      </div>
    </div>
  )
}
