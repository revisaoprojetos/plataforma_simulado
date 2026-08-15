import { cn } from '@/lib/utils'

// Reações da mascote (capivara) — cada uma é uma arte em /public/mascote/<id>.png.
export type ReacaoMascote =
  | 'feliz' | 'satisfeita' | 'ideia' | 'joinha' | 'pensando' | 'atencao'
  | 'concluido' | 'coracao' | 'escrevendo' | 'estudante' | 'meditando'
  | 'procurando' | 'cafe' | 'chorando' | 'balanca'

/** Catálogo (label pt-BR) — usado no admin p/ escolher a pose de cada situação. */
export const REACOES_MASCOTE: { id: ReacaoMascote; nome: string }[] = [
  { id: 'feliz', nome: 'Feliz' },
  { id: 'satisfeita', nome: 'Satisfeita' },
  { id: 'joinha', nome: 'Joinha' },
  { id: 'ideia', nome: 'Ideia' },
  { id: 'pensando', nome: 'Pensando' },
  { id: 'atencao', nome: 'Atenção' },
  { id: 'concluido', nome: 'Concluído' },
  { id: 'coracao', nome: 'Coração' },
  { id: 'escrevendo', nome: 'Escrevendo' },
  { id: 'estudante', nome: 'Estudando' },
  { id: 'meditando', nome: 'Meditando' },
  { id: 'procurando', nome: 'Procurando' },
  { id: 'cafe', nome: 'Café' },
  { id: 'chorando', nome: 'Chorando' },
  { id: 'balanca', nome: 'Justiça' },
]

/**
 * Mascote do projeto (capivara). Renderiza uma POSE/reação com flutuação suave e, opcionalmente,
 * um balão de fala. Reutilizável em ajuda, celebrações, estados vazios, etc.
 */
export function Mascote({
  reacao = 'feliz',
  tamanho = 128,
  mensagem,
  balaoTitulo,
  flutua = true,
  entra = true,
  espelhar = false,
  className,
}: {
  reacao?: ReacaoMascote
  tamanho?: number
  mensagem?: React.ReactNode
  balaoTitulo?: React.ReactNode
  flutua?: boolean
  entra?: boolean
  /** Espelha horizontalmente (capivara olhando para o outro lado). */
  espelhar?: boolean
  className?: string
}) {
  return (
    <div className={cn('relative flex flex-col items-center', entra && 'motion-safe:animate-[mascote-in_.5s_cubic-bezier(.34,1.56,.64,1)_both]', className)}>
      {(mensagem || balaoTitulo) && (
        <div className="relative mb-2 max-w-[240px] motion-safe:animate-[mascote-balao_.35s_ease-out_.25s_both]">
          <div className="rounded-2xl border bg-card px-3.5 py-2.5 text-center text-sm shadow-md">
            {balaoTitulo && <div className="mb-0.5 text-xs font-bold text-primary">{balaoTitulo}</div>}
            {mensagem && <div className="leading-snug text-foreground">{mensagem}</div>}
          </div>
          {/* rabinho do balão apontando p/ a mascote */}
          <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r bg-card" />
        </div>
      )}
      {/* Span espelha (scaleX) sem conflitar com o float (translateY) na img. */}
      {/* Tamanho padronizado por ALTURA — as artes têm larguras diferentes; fixar a altura deixa a
          capivara visualmente do mesmo tamanho em todas as poses. */}
      <span className="inline-flex" style={espelhar ? { transform: 'scaleX(-1)' } : undefined}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/mascote/${reacao}.png`} alt="" draggable={false}
          className={cn('pointer-events-none select-none drop-shadow-sm', flutua && 'motion-safe:animate-[mascote-float_3.6s_ease-in-out_infinite]')}
          style={{ height: tamanho, width: 'auto' }}
        />
      </span>
    </div>
  )
}
