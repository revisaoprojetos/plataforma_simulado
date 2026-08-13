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
      <svg viewBox="0 0 24 24" className="ico-flame-svg" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" strokeLinecap="round" aria-hidden>
        {/* Contorno (vazado): corpo em gota com fundo redondo + línguas menores no topo. */}
        <path className="flame-t1" d="M12 3.5 C 15.5 8 17.5 11 17.5 14.5 A5.5 5.5 0 0 1 6.5 14.5 C 6.5 11 8.5 8 12 3.5 Z" />
        <path className="flame-t2" d="M9.2 5 C 10.4 7 10.8 8.4 10.8 9.8 A2 2 0 0 1 6.8 9.8 C 6.8 8.2 7.8 6.6 9.2 5 Z" />
        <path className="flame-t3" d="M14.8 5 C 13.6 7 13.2 8.4 13.2 9.8 A2 2 0 0 0 17.2 9.8 C 17.2 8.2 16.2 6.6 14.8 5 Z" />
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
