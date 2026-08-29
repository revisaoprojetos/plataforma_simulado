// Skeleton instantâneo enquanto a etapa carrega/compila — evita a sensação de "travado".
export default function CriarLoading() {
  return (
    <div className="space-y-5">
      <div className="h-14 animate-pulse rounded-2xl border bg-muted/40" />
      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className="h-6 w-64 animate-pulse rounded bg-muted/40" />
          <div className="h-40 animate-pulse rounded-2xl border bg-muted/30" />
          <div className="h-40 animate-pulse rounded-2xl border bg-muted/30" />
        </div>
        <div className="h-72 animate-pulse rounded-2xl border bg-muted/30" />
      </div>
    </div>
  )
}
