'use client'

/** Cabeçalho compacto de seção (número + título + descrição) para a página única do assistente. */
export function Secao({
  numero,
  titulo,
  descricao,
  children,
}: {
  numero: number
  titulo: string
  descricao?: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {numero}
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-tight">{titulo}</h2>
          {descricao && <p className="text-xs text-muted-foreground">{descricao}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}
