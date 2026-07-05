import { cn } from '@/lib/utils'

/**
 * Cabeçalho de seção padrão do sistema: gradiente + chip de ícone colorido,
 * título e subtítulo, colado no topo do card. Use dentro de um
 * `<Card className="overflow-hidden" style={{ ['--card-spacing' as any]: '0px' }}>`.
 *
 * Sem `cor` usa a cor primária do tema; com `cor` (hex) usa a identidade da entidade.
 */
export function SecaoHeader({
  icon: Icon,
  titulo,
  subtitulo,
  cor,
  acao,
}: {
  icon: React.ComponentType<{ className?: string }>
  titulo: string
  subtitulo?: string
  cor?: string
  acao?: React.ReactNode
}) {
  return (
    <div
      className={cn('flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3.5', !cor && 'bg-gradient-to-r from-primary/10 to-transparent')}
      style={cor ? { background: `linear-gradient(90deg, ${cor}1f, transparent 55%)` } : undefined}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm', !cor && 'bg-primary')}
          style={cor ? { background: cor } : undefined}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold leading-tight">{titulo}</h3>
          {subtitulo && <p className="truncate text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
      </div>
      {acao && <div className="flex items-center gap-2">{acao}</div>}
    </div>
  )
}
