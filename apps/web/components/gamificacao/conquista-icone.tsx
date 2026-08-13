import { iconeConquista, animConquista } from '@/lib/gamificacao/icones'

// Flecha (projétil): haste + ponta + penas, apontando para cima.
function Flecha({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 12 16" className={className} aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4.5 V13.5" />
      <path d="M6 1 L3.2 5.2 H8.8 Z" fill="currentColor" stroke="none" />
      <path d="M6 10.5 L3.2 14 M6 10.5 L8.8 14" />
    </svg>
  )
}

// Ícone de conquista com animação de hover + efeitos especiais:
// - chama: 3 línguas de fogo independentes (o topo muda de forma) + flicker
// - brilho/gema: faíscas piscando ao redor
// - escudo: flechas vindas das diagonais de baixo que cravam (separadas) no escudo
// Deve ficar dentro de um contêiner `relative` que seja `.group` (o card).
export function ConquistaIconeFx({ icone, className = 'h-5 w-5' }: { icone: string; className?: string }) {
  if (icone === 'flame') {
    return (
      <svg viewBox="0 0 24 24" className="ico-flame-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {/* Contorno ÚNICO (vazado), base redonda — sem sobreposição. Flicker de fogo no hover. */}
        <path className="flame-path" d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
      </svg>
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
          <Flecha className="ico-arw ico-arw-lu" />
          <Flecha className="ico-arw ico-arw-ld" />
          <Flecha className="ico-arw ico-arw-ru" />
          <Flecha className="ico-arw ico-arw-rd" />
        </>
      )}
    </>
  )
}
