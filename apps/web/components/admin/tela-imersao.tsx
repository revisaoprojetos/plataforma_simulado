import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EstiloImersao = 'spinner' | 'barra' | 'pulsar' | 'pontos' | 'circulo'
export const ESTILOS_IMERSAO: { id: EstiloImersao; nome: string }[] = [
  { id: 'spinner', nome: 'Logo + Spinner' },
  { id: 'barra', nome: 'Logo + Barra' },
  { id: 'pulsar', nome: 'Logo Pulsante' },
  { id: 'pontos', nome: 'Logo + Pontos' },
  { id: 'circulo', nome: 'Logo + Círculo' },
]

interface Props {
  estilo?: EstiloImersao
  logo?: string | null
  nome?: string
  mensagem?: string
  /** compacto = prévia dentro de um box; cheio = full-screen fixo. */
  compacto?: boolean
  className?: string
}

export function TelaImersao({ estilo = 'spinner', logo, nome = 'Plataforma', mensagem = 'Carregando…', compacto, className }: Props) {
  const pulsa = estilo === 'pulsar'
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-6 bg-background text-foreground',
        compacto ? 'relative h-80 w-full overflow-hidden rounded-lg' : 'fixed inset-0 z-[100] min-h-screen',
        className,
      )}
    >
      {/* Logo */}
      <div className={cn('animate-page', pulsa && 'animate-pulse')}>
        {logo ? (
          <img src={logo} alt={nome} className="h-20 w-auto max-w-[220px] object-contain" />
        ) : (
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary text-3xl font-bold text-primary-foreground">
            {(nome[0] ?? 'P').toUpperCase()}
          </div>
        )}
      </div>

      {/* Mensagem (acima do indicador) */}
      {mensagem && <p className="text-sm text-muted-foreground">{mensagem}</p>}

      {/* Indicador conforme o estilo */}
      {estilo === 'spinner' && <Loader2 className="h-7 w-7 animate-spin text-primary" />}
      {estilo === 'pontos' && (
        <div className="flex gap-2">
          {[0, 0.15, 0.3].map((d, i) => <span key={i} className="h-3 w-3 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${d}s` }} />)}
        </div>
      )}
      {estilo === 'barra' && (
        <div className="h-1.5 w-56 max-w-[70%] overflow-hidden rounded-full bg-muted">
          <div className="loading-bar-fill h-full rounded-full bg-primary" />
        </div>
      )}
      {estilo === 'circulo' && (
        <span className="block h-8 w-8 animate-spin rounded-full border-[3px] border-muted border-t-primary" />
      )}
      {/* pulsar não tem indicador extra — o logo já pulsa */}
    </div>
  )
}
