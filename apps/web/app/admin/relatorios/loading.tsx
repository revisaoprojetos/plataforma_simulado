// Skeleton instantâneo para TODA a área de Relatórios (hub + cada relatório). Sem este loading.tsx,
// as páginas `force-dynamic` (SSR pesado) deixavam o clique "sem resposta" até o servidor terminar —
// dando a sensação de que era preciso clicar várias vezes. Agora a navegação responde na hora.
export default function LoadingRelatorios() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Carregando relatório">
      {/* Cabeçalho */}
      <div className="flex items-center gap-3">
        <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-muted" />
        <div className="space-y-2">
          <div className="h-6 w-56 animate-pulse rounded bg-muted" />
          <div className="h-4 w-80 max-w-[70vw] animate-pulse rounded bg-muted/70" />
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-4 shadow-sm">
            <div className="h-3 w-24 animate-pulse rounded bg-muted/70" />
            <div className="mt-3 h-8 w-20 animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Blocos de gráfico/tabela */}
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="mt-4 h-48 w-full animate-pulse rounded-xl bg-muted/50" />
          </div>
        ))}
      </div>

      <div className="rounded-2xl border bg-card p-5 shadow-sm">
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="mt-4 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-9 w-full animate-pulse rounded-lg bg-muted/40" />
          ))}
        </div>
      </div>
    </div>
  )
}
