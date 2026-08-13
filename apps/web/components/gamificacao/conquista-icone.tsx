import { Flame, ArrowUpRight, ArrowUpLeft } from 'lucide-react'
import { iconeConquista, animConquista } from '@/lib/gamificacao/icones'

// Ícone de conquista com animação de hover + efeitos especiais:
// - chama: 3 frames alternando (a forma do topo troca) + flicker
// - brilho/gema: faíscas piscando ao redor
// - escudo: flechas vindas das diagonais de baixo que cravam no escudo
// Deve ficar dentro de um contêiner `relative` que seja `.group` (o card).
export function ConquistaIconeFx({ icone, className = 'h-5 w-5' }: { icone: string; className?: string }) {
  if (icone === 'flame') {
    return (
      <span className="ico-flame-frames" aria-hidden>
        <Flame className="ico-frame ico-frame-1" />
        <Flame className="ico-frame ico-frame-2" />
        <Flame className="ico-frame ico-frame-3" />
      </span>
    )
  }

  const Icon = iconeConquista(icone)
  const brilho = icone === 'sparkles' || icone === 'gem'
  const escudo = icone === 'shield'
  return (
    <>
      <Icon className={`${className} ${animConquista(icone)}`} />
      {brilho && (
        <>
          <span className="ico-spark ico-spark-1" aria-hidden />
          <span className="ico-spark ico-spark-2" aria-hidden />
          <span className="ico-spark ico-spark-3" aria-hidden />
          <span className="ico-spark ico-spark-4" aria-hidden />
        </>
      )}
      {escudo && (
        <>
          <ArrowUpRight className="ico-arw ico-arw-bl" aria-hidden />
          <ArrowUpLeft className="ico-arw ico-arw-br" aria-hidden />
        </>
      )}
    </>
  )
}
